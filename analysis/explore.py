"""Starter for analyzing Dundor fights in pandas.

Generate the JSON first, then run this:

    npm run build
    npm run -s tojson fixtures/*.txt > fights.json
    python3 analysis/explore.py fights.json

The `-s` matters: without it npm prints its run banner to stdout and the
redirected file is not valid JSON.

The JSON carries three layers per fight and this script flattens each into a
DataFrame:

    fights   one row per fight (outcome, damage, mitigation, luck, tempo)
    turns    one row per logged turn (HP for both sides, damage dealt)
    rolls    one row per damage roll (element, raw value, band percentile)

A fight is identified by (source, fight): one pasted file can hold several
fights, so `source` alone is not a valid join or groupby key.

Everything here is read from the JSON. If you find yourself wanting a number
that is not in it, that is a parser feature request, not a reason to re-parse
the text in Python.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pandas as pd

ROLL_COLUMNS = ["source", "fight", "side", "who", "turn", "type", "raw", "min", "max", "pct"]


def load(path: str | Path) -> list[dict]:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        sys.exit(f"cannot read {path}: {exc}")
    except UnicodeDecodeError as exc:
        sys.exit(f"{path} is not UTF-8 text: {exc}")
    try:
        entries = json.loads(text)
    except json.JSONDecodeError as exc:
        hint = ""
        if text.lstrip().startswith(">"):
            hint = " — this looks like an npm banner; regenerate with `npm run -s tojson` so stdout is clean JSON"
        sys.exit(f"{path} is not valid JSON: {exc}{hint}")
    if not isinstance(entries, list):
        sys.exit(f"{path}: expected the JSON array that `npm run -s tojson` emits")
    errors = [e for e in entries if "error" in e]
    for e in errors:
        print(f"skipping {e['source']}#{e['fightIndex']}: {e['error']}", file=sys.stderr)
    return [e for e in entries if "error" not in e]


def fights_frame(entries: list[dict]) -> pd.DataFrame:
    rows = []
    for e in entries:
        a = e["analysis"]
        f = e["fight"]
        player, monster = a["player"], a["monster"]
        me, mit, luck = a["stats"][player], a["playerMitigation"], a["luck"][player]
        outcome = f["outcome"]
        rows.append({
            "source": e["source"],
            "fight": e["fightIndex"],
            "player": player,
            "monster": monster,
            "decided": outcome["decided"],
            # A truncated log parses with winner null and decided false; that is
            # not a loss, so `won` stays NA and win rates skip it.
            "won": outcome["winner"] == player if outcome["decided"] else None,
            "turns": a["totalTurns"],
            "approach_turns": a["approachTurns"],
            "start_hp_pct": a["startHpPct"],
            "dealt": me["dealt"],
            "raw_rolled": me["rawRolled"],
            "taken": mit["taken"],
            "mitigated_pct": mit["pct"],
            "hit_rate": a["playerHitRate"],
            "expected_hits": luck["expectedHits"],
            "hits": luck["hits"],
            "dmg_luck_pct": luck["avgPct"],
            "overkill": a["overkill"] if a["overkillOn"] == monster else 0,
            "player_xl": f["entities"][player]["stats"].get("Xl"),
        })
    df = pd.DataFrame(rows)
    df["won"] = df["won"].astype("boolean")
    # Stat-block values arrive as strings; leave them and XL 9 sorts after XL 35.
    df["player_xl"] = pd.to_numeric(df["player_xl"])
    return df


def turns_frame(entries: list[dict]) -> pd.DataFrame:
    rows = []
    for e in entries:
        a = e["analysis"]
        player, monster = a["player"], a["monster"]
        hp = {s["turn"]: s["hp"] for s in a["series"][player]}
        mhp = {s["turn"]: s["hp"] for s in a["series"][monster]}
        for t in a["turnDamage"]:
            rows.append({
                "source": e["source"],
                "fight": e["fightIndex"],
                "turn": t["turn"],
                "player_hp": hp.get(t["turn"]),
                "monster_hp": mhp.get(t["turn"]),
                "player_dealt": t["dealt"].get(player, 0),
                "monster_dealt": t["dealt"].get(monster, 0),
            })
    return pd.DataFrame(rows)


def rolls_frame(entries: list[dict]) -> pd.DataFrame:
    rows = []
    for e in entries:
        a = e["analysis"]
        for who in (a["player"], a["monster"]):
            side = "player" if who == a["player"] else "monster"
            for r in a["luck"][who]["rolls"]:
                rows.append({"source": e["source"], "fight": e["fightIndex"],
                             "side": side, "who": who, **r})
    df = pd.DataFrame(rows)
    # A log pasted without stat blocks has no damage bands, hence no rolls;
    # keep the columns so groupbys on an empty frame still resolve.
    return df if not df.empty else pd.DataFrame(columns=ROLL_COLUMNS)


def main() -> None:
    if len(sys.argv) > 2:
        sys.exit("usage: python3 analysis/explore.py [fights.json]")
    path = sys.argv[1] if len(sys.argv) > 1 else "fights.json"
    entries = load(path)
    if not entries:
        sys.exit(f"no fights in {path}")

    fights = fights_frame(entries)
    turns = turns_frame(entries)
    rolls = rolls_frame(entries)

    pd.set_option("display.width", 160)
    print(f"\n{len(fights)} fights, {len(turns)} turn rows, {len(rolls)} damage rolls\n")

    print("== per fight ==")
    print(fights[["source", "fight", "monster", "won", "turns", "dealt", "taken",
                  "mitigated_pct", "hit_rate", "dmg_luck_pct"]].round(1).to_string(index=False))
    undecided = int(fights["won"].isna().sum())
    if undecided:
        print(f"note: {undecided} fight(s) undecided — the log ended before a result; "
              "excluded from win rates")

    print("\n== by monster ==")
    by_monster = fights.groupby("monster").agg(
        fights=("won", "size"),
        win_rate=("won", "mean"),
        avg_dealt=("dealt", "mean"),
        avg_taken=("taken", "mean"),
        avg_turns=("turns", "mean"),
    ).round(1)
    print(by_monster.to_string())

    print("\n== luck: expected vs actual hits, all fights pooled ==")
    pooled = fights[["expected_hits", "hits"]].sum()
    print(f"expected {pooled['expected_hits']:.2f}, landed {int(pooled['hits'])} "
          f"({pooled['hits'] - pooled['expected_hits']:+.2f})")

    print("\n== damage roll percentiles by element ==")
    if rolls.empty:
        print("no banded rolls: these logs carry no damage-band stat blocks")
    else:
        print(rolls.groupby(["side", "type"])["pct"].describe()[["count", "mean", "min", "max"]]
              .round(1).to_string())


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Piped into `head` and the reader closed first. Point stdout at
        # /dev/null so the interpreter's exit flush does not raise again.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
