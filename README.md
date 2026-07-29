# Dundor Battle Ledger

Read [Dundor](https://top.gg/bot/1284876985822216232) combat logs and reconstruct what
actually happened in a fight: damage rolls, mitigation, move economy and the turns
that were wasted.

```
npm install
npm test        # parser suite
npm run dev     # web app on :5173
npm run build   # parser to dist/, app to apps/web/dist/
npm run deploy  # build + publish to Cloudflare Workers
```

## Deploying

The app is entirely static. Logs are parsed in the browser, so there is no backend
and nothing is ever uploaded. It deploys as an assets-only Cloudflare
Worker (`apps/web/wrangler.jsonc`).

```
npx wrangler login    # once, opens a browser
npm run deploy
```

That publishes to `https://dundor-ledger.<your-subdomain>.workers.dev`. Change the
`name` in `apps/web/wrangler.jsonc` to change the hostname.

To check the exact runtime locally before publishing:

```
npm run cf:preview -w @dundor/web   # serves the build through workerd on :8787
```

### What ships publicly

The bundle carries a built-in sample fight so the app has something to show on
first load. It is generated from `fixtures/lava-golem-xl24.txt` with the player
name, god and Discord user ID scrubbed:

```
npm run sample          # regenerate from the fixture
npm run check:sample    # verify the committed file is still clean
```

`build` and `test` both run the check first, so a hand-edit that reintroduces
personal data fails rather than shipping. The fixtures keep their real values, since
the repo is private and the parser tests assert against them.

Source maps are off for production builds, since a map would publish every
`.ts` file verbatim. Flip `sourcemap` in `apps/web/vite.config.ts` if you would
rather have readable stack traces.

## Workflow

Dundor emits the verbose log only on request, as an attached `.txt`:

```
dun fight            # play
dun logs get 1       # Dundor attaches the log for that fight
```

You do **not** have to alternate. Run a batch of fights, collect the logs at the end
(`dun logs get 1`, `2`, `3`, …), then drag all the files onto the page at once. A single
file holding several fights is split automatically. With more than one loaded you get a
fight switcher and session totals.

## Analyzing fights in Python

`npm run -s tojson <files>` converts logs to JSON with the full parse, analysis and
insights per fight (`-s` keeps npm's banner out of the redirect). `analysis/explore.py`
is a pandas starter that flattens it into DataFrames. See `analysis/README.md`.

## Layout

| Path | What it is |
|---|---|
| `packages/parser` | `@dundor/parser`. Parse, analyse, derive insights. No DOM, no dependencies. |
| `apps/web` | React + Vite front end. Presentation only; every number comes from the parser. |
| `fixtures/` | Real logs: three Lava Golem wins at XL 24/25/26, a Magma Golem loss at XL 35, plus two fights in one paste. |
| `prototype/` | The original single-file HTML prototype. Superseded, kept for reference. |

The parser is deliberately DOM-free so the same module can later back a Discord
log-reader bot without touching the analysis code.

### Parser API

```ts
import { splitLogs, parseFight, analyze, deriveInsights } from '@dundor/parser';

for (const chunk of splitLogs(text)) {      // one paste may hold many fights
  const fight = parseFight(chunk);          // raw text -> structured fight
  const analysis = analyze(fight);          // -> damage, mitigation, tempo, stalls
  const insights = deriveInsights(fight, analysis);  // -> ranked findings
}
```

`deriveInsights` returns data, not HTML. Bodies use `**bold**` / `*italic*` markers that
the UI renders, so nothing the parser emits can inject markup.

## What the log gets wrong if you read it literally

- **Stated AC reduction is inflated.** Dundor prints `reduces the damage by 140` against
  a 24-damage hit, then floors the result at 1. Summing the stated cuts reported 743%
  mitigation. Real absorption is `raw − dealt`, and a test asserts it never exceeds 100%.
- **Turn numbers are not contiguous.** Every real log jumps from `TURN 1` to `TURN 3`.
- **One paste can hold many fights.** Dundor repeats the `The fight happens between`
  header per fight. Without splitting, fights merge into one record with duplicated turn
  numbers and summed damage: 471 reported where the first fight dealt 211. `splitLogs()`
  handles it; `parseFight()` also stops at the next header as a second line of defence.
- **`Hp Left` is not `Hp`.** The `FightEntity` header reports what a combatant
  walked in with; `Hp` inside the nested data block is their maximum. Dundor does
  not heal you between fights, so these differ often. One real log opens at
  47/389. Seeding a chart from the maximum invents a 342-point cliff that never
  happened.
- **Negative resistance is a vulnerability.** A Lava Golem's `Rcold: -2` means cold lands
  ~33% harder. Filtering the resistance table to positive values hides the single most
  actionable fact about a monster.

Each resistance pip is 100/6 % (1 pip → 16.67%, 2 pips → 33.33%), consistent across every
log observed so far.

Input shapes handled: full output, logs section only, header without stat blocks, losses,
multi-fight pastes, and monsters whose maximum HP is never declared.

## Command deck

The buttons copy a command to the clipboard for you to paste. They do not send anything.
Discord prohibits automating a user account, and no bot API can invoke another bot's slash
commands, so a compliant tool cannot send on your behalf. Sending sits behind one
interface should Dundor ever expose an official API.

## Status

Working scaffold. Not affiliated with Dundor; this reads output you already have.
