# Opening a fight in the browser from Discord

**Status:** designed, not implemented
**Date:** 2026-08-05

## The problem

`apps/web` is a full analysis UI with damage charts, telemetry, HP curves, stat
blocks and session totals. It is also unreachable from Discord. Someone reading
the bot's embed has no path to it except knowing the site exists, saving the
`.txt`, and dropping it on the page by hand.

The embed is good now that it carries every insight body, but it is text. The
charts and the turn-by-turn view only exist in the browser.

## Constraints

Three, and they eliminate most of the obvious answers.

**Logs are never persisted.** This was stated to the Dundor developer as a
reason API access to logs is low risk: parsed in memory, posted back as an
embed, nothing written to disk. Any design that stores logs to serve them
later breaks that sentence and requires reopening a settled conversation from a
weaker position.

**It has to stay cheap.** The web app is an assets-only Cloudflare Worker on the
free tier with no backend. Introducing storage or compute changes what it is.

**It has to follow Discord's rules.** No scraping, no retention beyond purpose.

## Decisions

Settled during design, recorded so they are not relitigated:

- **One fight per link now, session view later.** Phase 1 ships single-fight links. Session aggregation is deferred until there is a reason to solve it.
- **Anyone in the channel can click.** The link goes in the public embed reply, matching how the bot already behaves. No DM flow, no ownership check.
- **Oversized fights link to the bare site.** With a line telling the reader to drop the `.txt` on the page. Always a link, never a dead end.
- **A link button, not a markdown link.** Buttons are what the Dundor playerbase already uses, and they are a *message component*, so the URL does not consume the embed's 6,000 character budget. A markdown link would put the encoded log in direct competition with the insight text.

## Approach

The log rides inside the URL fragment. Nothing is stored anywhere.

```
Dundor posts log.txt
  └─ bot parses it (unchanged)
     └─ bot gzips the RAW log text, base64url-encodes it
        └─ embed exactly as it looks today
           + link button "Open full breakdown"
             → https://<host>/#log=g1.<encoded>

user clicks
  └─ Cloudflare serves the static SPA
     (it never sees the log: fragments are not transmitted)
     └─ page reads location.hash
        └─ base64url decode → DecompressionStream('gzip')
           └─ plain text into the existing ingest path
              └─ charts, telemetry, stat blocks
```

### Why the raw log rather than the parsed analysis

Measured on the fixtures, the raw log compresses **smaller** than its own
analysis JSON (Fungus: 4,634 characters against 5,352 for a trimmed analysis).
It also avoids inventing a data contract between bot and web. The browser
re-parses with the same `@dundor/parser` the bot used, so the two cannot
disagree, and a parser improvement reaches both without a migration.

### Why this strengthens the persistence promise

The log is in a URL fragment. Fragments are never sent in an HTTP request and
are stripped from `Referer` headers, so the log does not reach Cloudflare, does
not appear in any access log, and is not exposed to third parties. The current
architecture already avoids disk; this avoids the network too.

### Measured payload sizes

| Fixture | Raw | gzip + base64url |
| --- | --- | --- |
| `snake-xl100.txt` | 4,850 | 1,495 |
| `icecorn-xl63.txt` | 6,945 | 1,820 |
| `two-fights-one-paste.txt` | 20,883 | 2,887 |
| `fungus-creature-loss-xl63.txt` | 39,109 | 4,634 |

## URL contract

```
https://<host>/#log=g1.<base64url(gzip(raw log text))>
```

- **Fragment, not query string.** Keeps the log off the wire entirely.
- **Scheme tag `g1`.** Lets the encoding change later without breaking links already sitting in Discord history, and can be branched on without decoding.
- **base64url.** Its alphabet is URL-safe, so no percent-encoding.

## Failure handling

### Web

Every failure lands on the working app with the drop zone visible. There is no
blank page and no dead end; the worst case degrades to the site the reader
could have used anyway. Messages surface through the `status: { text, error }`
prop `Ingest` already accepts.

| Condition | Shown |
| --- | --- |
| No fragment | The app as it behaves today |
| Unknown scheme tag | "This link was made by a newer version of the bot" |
| Base64 or gzip decode fails | "This link looks damaged or truncated" |
| Decodes but is not a log | The parser's own message, as already surfaced in Discord |
| `DecompressionStream` missing | "Your browser can't open compressed links, download the .txt and drop it here" |

### Bot

- **Over budget:** button points at the bare site, embed notes the fight was too long to link directly.
- **Discord rejects the payload:** catch and **retry once without components**. A wrong budget constant then costs a button rather than the whole analysis. Without this, a miscalibrated constant means the reply fails and the reader gets nothing, which is worse than today.
- **`LEDGER_WEB_URL` unset:** no button, everything else unchanged.

## Changes

| File | Change |
| --- | --- |
| `apps/bot/src/link.ts` | New. `encodeLog(text)`, `logUrl(base, text)` returning `{ url, full }` where `full` is false when the URL points at the bare site, and the `MAX_LINK_CHARS` budget constant. Pure |
| `apps/bot/src/link.test.ts` | New. Round trip, budget boundary, URL safety |
| `apps/bot/src/index.ts` | Build the button, retry without components on rejection |
| `apps/web/src/link.ts` | New. `readFragment(hash)` and `decodeLog(payload)` |
| `apps/web/src/link.test.ts` | New. Fragment parsing and each failure rung |
| `apps/web/src/App.tsx` | Mount-time effect reading the fragment into the existing handler |
| `apps/web/package.json` | Add vitest, matching parser and bot |
| `fixtures/link-contract.json` | New. One encoded string pinning the contract |
| `scripts/probe-button-url.mjs` | New. Finds Discord's component URL ceiling |

### Pinning the contract

The bot encodes and the web decodes, but neither workspace depends on the
other, so nothing would catch them drifting apart. `fixtures/link-contract.json`
holds one encoded string generated from `snake-xl100.txt`. The bot test asserts
its encoder still produces exactly that string; the web test asserts its decoder
still recovers the original log from it. Either side drifting fails a test, at
the cost of one small file rather than a shared package for two functions.

## Open question

**Discord's cap on component URL length is undocumented.** `discord.js` does not
enforce one; its `urlValidator` checks only the protocol. `scripts/probe-button-url.mjs`
posts buttons at increasing URL lengths against a private channel until the API
refuses, and prints the ceiling. That number, less a safety margin, becomes
`MAX_LINK_CHARS`. The retry-without-components path remains as a backstop
regardless, and is not a reason to skip the margin.

Until the probe is run, `MAX_LINK_CHARS` should be set conservatively enough to
cover ordinary fights. Every fixture except the 44-turn Fungus log encodes under
3,000 characters.

## Rollout

Ships dark. Deploy with `LEDGER_WEB_URL` unset and confirm nothing changed, then
probe, set the constant, then set the variable. Manual steps are in
`docs/manual/log-link-manual.md`.

## What this gets for free

The link carries the whole file, so a multi-fight paste opens in the browser
with **all** its fights rather than the three the embed caps at. The current
"Upload one on its own for the full breakdown" becomes "click through for all 7
fights", and the multi-fight case stops being a limitation.

## Privacy

Anyone holding the link holds the log. This is not new exposure: the attachment
sits in the same channel and is equally readable by anyone who can see it.
Recorded here as a decision rather than an oversight.

## Out of scope

**The session view.** Aggregating many fights cannot ride in a single link. When
it is wanted, the path that does not reopen the storage conversation is
accumulating fights in `localStorage` as links are opened, which keeps the data
on the reader's own machine rather than a server. Not built, not designed.
