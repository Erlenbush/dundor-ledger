# Opening a fight in the browser from Discord

**Status:** implemented, ships dark behind `LEDGER_WEB_URL`
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
- **A markdown link in the embed description, not a link button.** Buttons were chosen first, for a reason that turned out to be the exact reason they cannot work: a component does not consume the embed's 6,000 character budget, but it is capped at **512 characters** instead, and the smallest real log needs about 1,545. Measured, not assumed. See "Measured Discord limits" below.
- **gzip first, brotli only when gzip does not fit.** Browsers decompress gzip natively; brotli costs the reader a ~204 KB WebAssembly decoder. Most fights fit gzip and those readers should not pay for a decoder they never use.

## Approach

The log rides inside the URL fragment. Nothing is stored anywhere.

```
Dundor posts log.txt
  └─ bot parses it (unchanged)
     └─ bot gzips the RAW log text, base64url-encodes it
        └─ embed exactly as it looks today
           + markdown link in the description
             → https://<host>/#log=g1.<encoded>   (gzip, native)
             → https://<host>/#log=b1.<encoded>   (brotli, when gzip is too big)

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

- **Over budget under both encodings:** the link points at the bare site and says the fight was too long to link directly. No fixture reaches this any more; it needs a raw log beyond roughly 44,000 characters.
- **Discord rejects the payload:** `sendReply` catches an HTTP 400 `DiscordAPIError` and retries once without components. This is now a vestigial safety net rather than the main path, since the reply no longer carries components at all.
- **`LEDGER_WEB_URL` unset or unparseable:** no link, everything else unchanged.

## Changes

| File | Change |
| --- | --- |
| `apps/bot/src/link.ts` | New. `encodeLog(text)`, `logUrl(base, text)` returning `{ url, full }` where `full` is false when the URL points at the bare site, and the `MAX_LINK_CHARS` budget constant. Pure |
| `apps/bot/src/link.test.ts` | New. Round trip, budget boundary, URL safety |
| `apps/bot/src/index.ts` | Read and validate `LEDGER_WEB_URL`, track the single source body |
| `apps/web/src/link.ts` | New. `readFragment(hash)` and `decodeLog(payload)` |
| `apps/web/src/link.test.ts` | New. Fragment parsing and each failure rung |
| `apps/web/src/App.tsx` | Mount-time effect reading the fragment into the existing handler |
| `apps/web/package.json` | Add vitest, matching parser and bot |
| `fixtures/link-contract.json` | New. One encoded string pinning the contract |
| `scripts/probe-button-url.mjs` | New. Measured the component ceiling; kept as the tool for re-measuring |
| `apps/bot/src/reply.ts` | New. Pure reply builder, so the link and its fallbacks are testable |
| `apps/web/src/App.tsx` | Mount effect, plus a loud banner when a link fails to open |

### Pinning the contract

The bot encodes and the web decodes, but neither workspace depends on the
other, so nothing would catch them drifting apart. `fixtures/link-contract.json`
holds `scheme`, `source`, `encoded` (one encoded string generated from
`snake-xl100.txt`), and `fragment` (the full `#log=g1.…` string built from it).
`encoded` alone pins the codec but not where it sits in a URL — a rename of
`log=` to something else would leave `encoded`-only assertions passing while
breaking every link already posted to Discord, since both sides hardcode
`log=` independently against themselves. `fragment` pins the URL shape too:
the bot test asserts `logUrl(...).url` ends with it, the web test asserts
`readFragment(fragment)` reads it as data and decodes to the source fixture.
Either side drifting fails a test, at the cost of one small file rather than a
shared package for two functions.

## Measured Discord limits

Measured against the live API on 2026-08-05, because the guess was wrong in a
way that could not work:

| Vehicle | Limit |
| --- | --- |
| Link button `url` | **512** |
| Embed `url` (clickable title) | **2,048** |
| Embed description | **at least 4,000** (cap is 4,096) |
| Whole embed | 6,000 |

`MAX_LINK_CHARS` is 3,700: under the description cap with room for the fight
summary lines and markdown syntax that share it, and under the whole-embed cap
alongside the insight fields.

### Reach of each encoding

| Encoding | Largest raw log that fits | Reader cost |
| --- | --- | --- |
| gzip (`g1`) | ~31,000 characters | none, native `DecompressionStream` |
| brotli (`b1`) | ~44,000 characters | ~204 KB WASM decoder, lazily fetched |

Every fixture links. The largest, the 44-turn Fungus fight at 39,109 raw
characters, needs brotli and lands at 3,514.

`scripts/probe-button-url.mjs` remains the way to re-measure if Discord changes
these, though it probes the component ceiling specifically.

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

Anyone holding the link holds the log — and this **is** new exposure, not a
restatement of what the Discord attachment already permits.

The attachment is channel-gated: reading it requires a Discord account with
access to the channel it was posted in. The link is an ambient,
unauthenticated, non-expiring capability: paste it anywhere — an unrelated
server, a bug tracker, a public page — and anyone who has it reads the full
raw log, with no Discord account and no membership check of any kind. It also
survives in browser history, syncs across a signed-in Chrome user's devices,
and sits in the address bar during a screenshare, none of which apply to
opening an attachment inside Discord.

The earlier version of this paragraph claimed the opposite — that this was
"not new exposure" because the attachment is "equally readable by anyone who
can see it" in the same channel. That equated channel membership with no
access control at all, which is not the same thing. The decision to ship this
tradeoff needs to be made honestly with the actual difference in view, not
waved off as already settled. It is not re-made here; this paragraph only
states what the tradeoff actually is.

## Out of scope

**The session view.** Aggregating many fights cannot ride in a single link. When
it is wanted, the path that does not reopen the storage conversation is
accumulating fights in `localStorage` as links are opened, which keeps the data
on the reader's own machine rather than a server. Not built, not designed.
