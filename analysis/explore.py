"""Starter for analyzing Dundor fights in pandas.

Generate the JSON first, then run this:

    npm run build
    npm run tojson fixtures/*.txt > fights.json
    python analysis/explore.py fights.json

The JSON carries three layers per fight and this script flattens each into a
DataFrame:

    fights   one row per fight (outcome, damage, mitigation, luck, tempo)
    turns    one row per logged turn (HP for both sides, damage dealt)
    rolls    one row per damage roll (element, raw value, band percentile)

Everything here is read from the JSON. If you find yourself wanting a number
that is not in it, that is a parser feature request, not a reason to re-parse
the text in Python.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd


def load(path: str | Path) -> list[dict]:
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
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
        rows.append({
            "source": e["source"],
            "player": player,
            "monster": monster,
            "won": f["outcome"]["winner"] == player,
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
    return pd.DataFrame(rows)


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
                rows.append({"source": e["source"], "side": side, "who": who, **r})
    return pd.DataFrame(rows)


def main() -> None:
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
    print(fights[["source", "monster", "won", "turns", "dealt", "taken",
                  "mitigated_pct", "hit_rate", "dmg_luck_pct"]].round(1).to_string(index=False))

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
    print(rolls.groupby(["side", "type"])["pct"].describe()[["count", "mean", "min", "max"]]
          .round(1).to_string())


if __name__ == "__main__":
    main()
