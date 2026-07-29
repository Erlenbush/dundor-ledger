"""Tests for explore.py against the parser's export contract.

Unit tests build minimal entries shaped like `ExportedFight` (see
packages/parser/src/export.ts and types.ts). Subprocess tests run the script
as a user would. The end-to-end test runs the real CLI over the repo fixtures
and is skipped when node or the built parser is missing.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

import explore

REPO = Path(__file__).resolve().parents[1]
SCRIPT = Path(explore.__file__)
CLI = REPO / "packages" / "parser" / "dist" / "cli.js"


def entry(source="fight.txt", fight_index=0, winner="Hero", decided=True,
          xl="24", player_rolls=(), monster_rolls=()):
    player, monster = "Hero", "Golem"
    roll = {"turn": 3, "type": "physical", "raw": 10, "min": 5, "max": 15, "pct": 50.0}
    return {
        "source": source,
        "fightIndex": fight_index,
        "fight": {
            "outcome": {
                "winner": winner if decided else None,
                "loser": (monster if winner == player else player) if decided else None,
                "decided": decided,
            },
            "entities": {player: {"stats": {"Xl": xl} if xl is not None else {}}},
        },
        "analysis": {
            "player": player,
            "monster": monster,
            "stats": {player: {"dealt": 100, "rawRolled": 150}},
            "playerMitigation": {"taken": 10, "pct": 90.0},
            "luck": {
                player: {"expectedHits": 2.5, "hits": 3, "avgPct": 55.0,
                         "rolls": [dict(roll, **r) for r in player_rolls]},
                monster: {"rolls": [dict(roll, **r) for r in monster_rolls]},
            },
            "totalTurns": 5,
            "approachTurns": 1,
            "startHpPct": 100.0,
            "playerHitRate": 75.0,
            "overkill": 4,
            "overkillOn": monster,
            "series": {player: [{"turn": 1, "hp": 50}, {"turn": 3, "hp": 45}],
                       monster: [{"turn": 1, "hp": 40}, {"turn": 3, "hp": 20}]},
            "turnDamage": [{"turn": 1, "dealt": {player: 10, monster: 5}},
                           {"turn": 3, "dealt": {player: 20}}],
        },
        "insights": [],
    }


def run_script(*args, cwd=None):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                          capture_output=True, text=True, cwd=cwd)


# -- fight identity: (source, fight), not source alone --------------------------

def test_all_frames_carry_fight_index():
    entries = [entry("paste.txt", 0), entry("paste.txt", 1), entry("solo.txt", 0)]
    for frame in (explore.fights_frame(entries), explore.turns_frame(entries),
                  explore.rolls_frame(entries)):
        assert "fight" in frame.columns

    fights = explore.fights_frame(entries)
    assert len(fights.groupby(["source", "fight"])) == 3

    turns = explore.turns_frame(entries)
    assert not turns.duplicated(["source", "fight", "turn"]).any()
    # The old source-only key conflated the two fights in the paste.
    assert turns.duplicated(["source", "turn"]).any()


def test_rolls_attributed_to_their_fight():
    entries = [entry("paste.txt", 0, player_rolls=[{"raw": 6}]),
               entry("paste.txt", 1, player_rolls=[{"raw": 14}])]
    rolls = explore.rolls_frame(entries)
    assert rolls[rolls["fight"] == 0]["raw"].tolist() == [6]
    assert rolls[rolls["fight"] == 1]["raw"].tolist() == [14]


# -- outcome: undecided is not a loss ------------------------------------------

def test_undecided_fight_is_na_not_loss():
    entries = [entry("won.txt", winner="Hero"),
               entry("cut.txt", decided=False)]
    fights = explore.fights_frame(entries)
    assert fights["won"].dtype == "boolean"
    assert fights.set_index("source")["won"]["won.txt"] == True  # noqa: E712
    assert pd.isna(fights.set_index("source")["won"]["cut.txt"])
    # Win rate is over decided fights only: 1/1, not 1/2.
    assert fights.groupby("monster")["won"].mean().iloc[0] == 1.0


def test_loss_still_counts():
    fights = explore.fights_frame([entry(winner="Golem")])
    assert fights["won"].iloc[0] == False  # noqa: E712


# -- stat-block values become numbers ------------------------------------------

def test_player_xl_is_numeric():
    fights = explore.fights_frame([entry(xl="9"), entry(xl="35"), entry(xl=None)])
    assert fights["player_xl"].mean() == 22  # would raise on str dtype
    assert fights["player_xl"].max() == 35  # lexicographic '9' > '35' would pick 9
    assert pd.isna(fights["player_xl"].iloc[2])


# -- empty rolls: legal for stat-less logs, must not crash ---------------------

def test_rolls_frame_empty_keeps_columns():
    rolls = explore.rolls_frame([entry()])
    assert rolls.empty
    assert set(explore.ROLL_COLUMNS) <= set(rolls.columns)
    rolls.groupby(["side", "type"])["pct"].describe()  # the line that crashed


def test_main_with_no_rolls_exits_zero(tmp_path):
    path = tmp_path / "fights.json"
    path.write_text(json.dumps([entry()]), encoding="utf-8")
    proc = run_script(path)
    assert proc.returncode == 0, proc.stderr
    assert "no banded rolls" in proc.stdout


# -- load(): error entries and clean diagnostics -------------------------------

def test_load_skips_error_entries(tmp_path, capsys):
    path = tmp_path / "fights.json"
    path.write_text(json.dumps([entry(), {"source": "bad.txt", "fightIndex": 0,
                                          "error": "no Logs section"}]), encoding="utf-8")
    kept = explore.load(path)
    assert len(kept) == 1
    assert "skipping bad.txt#0" in capsys.readouterr().err


@pytest.mark.parametrize("args, expect", [
    (["nope.json"], "cannot read"),
    (["."], "cannot read"),
    (["a.json", "b.json"], "usage:"),
])
def test_bad_invocations_fail_cleanly(tmp_path, args, expect):
    proc = run_script(*args, cwd=tmp_path)
    assert proc.returncode != 0
    assert expect in proc.stderr
    assert "Traceback" not in proc.stderr


def test_npm_banner_gets_a_hint(tmp_path):
    path = tmp_path / "fights.json"
    path.write_text("> dundor-ledger@0.1.0 tojson\n> node cli.js\n\n[]\n", encoding="utf-8")
    proc = run_script(path)
    assert proc.returncode != 0
    assert "npm run -s tojson" in proc.stderr
    assert "Traceback" not in proc.stderr


def test_non_utf8_fails_cleanly(tmp_path):
    path = tmp_path / "fights.json"
    path.write_bytes(b"\x80\x81")
    proc = run_script(path)
    assert proc.returncode != 0
    assert "not UTF-8" in proc.stderr
    assert "Traceback" not in proc.stderr


def test_non_array_json_fails_cleanly(tmp_path):
    path = tmp_path / "fights.json"
    path.write_text("{}", encoding="utf-8")
    proc = run_script(path)
    assert proc.returncode != 0
    assert "expected the JSON array" in proc.stderr


def test_all_error_entries_means_no_fights(tmp_path):
    path = tmp_path / "fights.json"
    path.write_text(json.dumps([{"source": "bad.txt", "fightIndex": 0,
                                 "error": "no Logs section"}]), encoding="utf-8")
    proc = run_script(path)
    assert proc.returncode != 0
    assert "no fights" in proc.stderr


def test_piping_into_head_is_quiet(tmp_path):
    path = tmp_path / "fights.json"
    path.write_text(json.dumps([entry()]), encoding="utf-8")
    proc = subprocess.run(
        f"{sys.executable} {SCRIPT} {path} | head -1",
        shell=True, capture_output=True, text=True)
    assert "Traceback" not in proc.stderr
    assert "BrokenPipeError" not in proc.stderr


# -- end to end over the real fixtures -----------------------------------------

@pytest.mark.skipif(not CLI.exists() or shutil.which("node") is None,
                    reason="needs node and a built parser (npm run build)")
def test_end_to_end_fixtures(tmp_path):
    fixtures = sorted((REPO / "fixtures").glob("*.txt"))
    assert fixtures, "no fixtures in the repo"
    gen = subprocess.run(["node", str(CLI), *map(str, fixtures)],
                         capture_output=True, text=True)
    assert gen.returncode == 0, gen.stderr
    path = tmp_path / "fights.json"
    path.write_text(gen.stdout, encoding="utf-8")

    proc = run_script(path)
    assert proc.returncode == 0, proc.stderr
    assert "6 fights" in proc.stdout

    entries = explore.load(path)
    fights = explore.fights_frame(entries)
    paste = fights[fights["source"] == "two-fights-one-paste.txt"]
    assert sorted(paste["fight"].tolist()) == [0, 1]
    assert (fights[fights["source"] == "magma-golem-loss-xl35.txt"]["won"] == False).all()  # noqa: E712
