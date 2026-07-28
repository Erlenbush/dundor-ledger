# Dundor Battle Ledger — prototype

A single-file prototype that reads a raw [Dundor](https://top.gg/bot/1284876985822216232)
combat log and reconstructs the fight: every roll, every point of mitigation, every
banked move, every wasted turn.

Open `index.html` in a browser. Nothing to install, no network calls — the parser and
all analytics run in the page.

## Workflow

Dundor only emits the verbose log on request, as an attached `.txt`:

```
dun fight            # play
dun logs get 1       # Dundor attaches the log for the last fight
```

You do **not** have to alternate. Run a batch of fights, then collect the logs at the
end (`dun logs get 1`, `2`, `3`, …) and drag all the `.txt` files onto the page at once.
With more than one loaded you also get a **Session totals** panel and a fight switcher.

## What's in here

| Part | Where | Notes |
|---|---|---|
| Parser | `index.html` § 1 | Pure function: raw log text → structured fight object. No DOM, no deps. |
| Analytics | `index.html` § 2 | Derived metrics only — no hardcoded numbers. |
| Render | `index.html` § 3 | Telemetry tiles, insight cards, HP chart, turn log, stat blocks. |
| Smoke test | `parser-smoke-test.mjs` | Extracts §1–2 from the HTML and asserts against real fixtures. |
| Fixtures | `fixtures/` | Real logs: three Lava Golem fights at XL 24/25/26, plus two fights in one paste. |

```
node parser-smoke-test.mjs
```

## Design notes

The parser is deliberately isolated from the DOM so the same module can back both a
web UI and a future Discord log-reader bot.

Two things the raw log gets wrong if you read it literally, both handled:

- **Stated AC reduction is inflated.** Dundor prints `reduces the damage by 140` against
  a 24-damage hit, then floors the result at 1. Summing the stated cuts reports 743%
  mitigation. Real absorption is `raw − dealt`.
- **Turn numbers are not contiguous.** The sample jumps from `TURN 1` to `TURN 3`.
  Never assume a dense sequence.
- **One paste can hold many fights.** Dundor repeats the `The fight happens between`
  header per fight. Without splitting on it, fights merge into one record with
  duplicated turn numbers and doubled damage. `splitLogs()` handles this, and
  `parseFight()` also stops at the next header as a second line of defence.
- **Negative resistance is a vulnerability.** A Lava Golem's `Rcold: -2` means cold
  lands ~33% harder. Filtering the resistance table to positive values hides the
  single most actionable fact about a monster.

Each resistance pip is 100/6 % (1 pip → 16.67%, 2 pips → 33.33%), consistent across
every log observed so far.

Handled input shapes: full output (stats + logs), logs section only, header without
stat blocks, losses, and monsters whose max HP is never declared.

## Command deck

The buttons copy a command to the clipboard for you to paste — they do not send
anything. Discord prohibits automating a user account, and no bot API can invoke
another bot's slash commands, so a compliant tool cannot send on your behalf. The
sending path is behind one interface should Dundor ever expose an official API.

## Status

Prototype for design review. Not affiliated with Dundor; this reads output you
already have access to.
