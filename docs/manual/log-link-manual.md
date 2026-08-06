# Log link — manual steps

Companion to `docs/superpowers/specs/2026-08-05-log-link-design.md`. Covers only
the steps that cannot be scripted: the interactive Cloudflare login, the
environment variable on bespin, and re-measuring Discord's limits if they move.

**Live as of 2026-08-05.** The web app is published at
<https://dundor-ledger.nuclidelabs.com> and `LEDGER_WEB_URL` is set on bespin,
so replies carry an "Open full breakdown" link. Every fixture links, including
the 44-turn Fungus fight. What follows is the record of how it was turned on and
what to do if it needs redoing.

The reply carries a **markdown link in the embed description**, not a link
button. Buttons cap their `url` at 512 characters and the smallest real log
needs about 1,545, so a button could never carry one. See the spec's "Measured
Discord limits".

The feature is inert with `LEDGER_WEB_URL` unset: no link, and the bot behaves
exactly as it did before. Do these steps in order, and stop at any point
without leaving things broken.

## 1. Publish the web app

- [ ] Authenticate wrangler (opens a browser, once per machine) ⏫

```bash
cd ~/dundor-ledger
npx wrangler login
```

- [ ] Publish it

```bash
npm run deploy
```

- [ ] Write down the published URL

It prints something like `https://dundor-ledger.<your-subdomain>.workers.dev`.
To change the hostname, edit `name` in `apps/web/wrangler.jsonc` and publish
again.

- [ ] Confirm the site loads and still accepts a dropped `.txt`

Use any fixture, e.g. `fixtures/snake-xl100.txt`. This must work before the
button is worth wiring up, because every failure path falls back to exactly
this.

## 2. Discord's limits (already measured)

Measured on 2026-08-05 against the live API:

| Vehicle | Limit |
| --- | --- |
| Link button `url` | 512 |
| Embed `url` (clickable title) | 2,048 |
| Embed description | at least 4,000 (cap 4,096) |
| Whole embed | 6,000 |

**You do not need to re-run the probe** unless links stop appearing or you want
to check whether Discord has moved these. If you do:

```bash
ssh bespin
set -a; . /home/dundor/dundor-ledger/apps/bot/.env; set +a
cd /home/dundor/dundor-ledger && node scripts/probe-button-url.mjs <channel id>
unset DISCORD_TOKEN
```

Point it at a private channel of your own. It posts throwaway messages and
deletes them, naming any it could not remove. Note it probes the *button*
ceiling specifically, which is no longer the vehicle the bot uses.

To get a channel ID without leaving your desk, ask the bot what it can see
rather than hunting through Discord's UI:

```bash
ssh bespin
set -a; . /home/dundor/dundor-ledger/apps/bot/.env; set +a
node -e 'const h={authorization:`Bot ${process.env.DISCORD_TOKEN}`};(async()=>{
  for (const g of await (await fetch("https://discord.com/api/v10/users/@me/guilds",{headers:h})).json()) {
    console.log(g.name);
    for (const c of (await (await fetch(`https://discord.com/api/v10/guilds/${g.id}/channels`,{headers:h})).json()).filter(c=>c.type===0))
      console.log("  #"+c.name, c.id);
  }})()'
unset DISCORD_TOKEN
```

## 3. The budget constant (already set)

`MAX_LINK_CHARS` in `apps/bot/src/link.ts` is **3,700** — under the 4,096
description cap with room for the summary lines and markdown syntax sharing it,
and under the 6,000 whole-embed cap alongside the insight fields.

Two encodings share that budget. gzip is tried first because browsers decode it
natively; brotli is used only when gzip does not fit, because it costs the
reader a ~204 KB decoder:

| Encoding | Largest raw log that fits |
| --- | --- |
| gzip (`g1`) | ~31,000 characters |
| brotli (`b1`) | ~44,000 characters |

Raising this constant is not free: it eats the headroom the insight fields need
inside the 6,000 total. `apps/bot/src/reply.test.ts` asserts both caps, so if
you raise it and those tests fail, the tests are right.

## 4. Turn the link on

- [ ] Add the URL to the bot's environment on bespin ⏫

```bash
ssh bespin
nano /home/dundor/dundor-ledger/apps/bot/.env
```

Add a line, using the URL from step 1 with no trailing slash:

```
LEDGER_WEB_URL=https://dundor-ledger.<your-subdomain>.workers.dev
```

- [ ] Restore permissions if your editor rewrote the file

```bash
chown dundor:dundor /home/dundor/dundor-ledger/apps/bot/.env
chmod 600 /home/dundor/dundor-ledger/apps/bot/.env
```

- [ ] Restart and confirm it came up

```bash
systemctl restart dundor-bot
systemctl status dundor-bot --no-pager
journalctl -u dundor-bot -n 20 --no-pager
```

`deploy/deploy-bot.sh` excludes `.env` from rsync, so this survives redeploys.

- [ ] Add the setting to the committed template, by hand

`apps/bot/.env.example` is covered by the global `protect-files` hook, so agents
cannot edit it and it will not get updated for you. Append:

```
# Optional: base URL of the web UI. Set it and replies carry an "Open full
# breakdown" button. Unset means no button.
# LEDGER_WEB_URL=https://dundor-ledger.example.workers.dev
# Optional: per-user cooldown in seconds for !ledger pull. Defaults to 30,
# and 0 disables it.
# LEDGER_PULL_COOLDOWN_SECONDS=30
```

`LEDGER_PULL_COOLDOWN_SECONDS` is missing from that file for the same reason and
has been since it was added, so this closes both gaps at once.

## 5. Verify

- [ ] Upload a small log and confirm the link appears

`fixtures/snake-xl100.txt` encodes to about 1,541 URL characters as a `g1`
gzip link. Nothing extra is downloaded when it is opened.

- [ ] Click it and confirm the fight opens with charts

- [ ] Upload `fixtures/fungus-creature-loss-xl63.txt` and confirm the brotli path ⏫

39,109 raw characters, too large for gzip, so this produces a `b1` link at
about 3,514 characters. Opening it fetches the ~204 KB WebAssembly decoder
once. If this one shows "too long to link directly" instead, brotli is not
being reached.

- [ ] Upload `fixtures/two-fights-one-paste.txt` and confirm the browser shows
      both fights, not just the embed's first three

- [ ] Confirm a broken link is obvious, not silent

Open `https://dundor-ledger.nuclidelabs.com/#log=g9.AAAA` in a **fresh tab**.
Expect a red "This link didn't open" banner above the drop zone. A fragment-only
change does not reload the page, so reusing a tab will show the previous fight
and look like a failure that isn't one.

## Rolling back

Remove or comment out `LEDGER_WEB_URL` and restart. The button disappears and
nothing else changes.

## Notes

- The log travels inside the URL fragment, after the `#`. Fragments are never
  sent in an HTTP request, so the log never reaches Cloudflare and never appears
  in an access log. This is why the approach does not contradict what was told
  to the Dundor developer about logs not being persisted.

- **This is new exposure, not equivalent to the Discord attachment.** The
  attachment is channel-gated: reading it requires a Discord account with
  access to that channel. The link is an ambient, unauthenticated,
  non-expiring capability — anyone who has it can read the full raw log from
  anywhere, with no Discord account and no membership check. Pasting a link
  into an unrelated chat, a bug report, or a public page hands over the whole
  log to whoever reads that. See the spec's Privacy section for the decision
  this rests on, which needs re-making, not assumed, before the feature is
  enabled.

- The links do not expire — they are self-contained and keep working as long
  as the site is published, and old `g1` links keep working now that `b1`
  exists, which is what the scheme tag is for. This is not the safety property it sounds like: a
  Discord attachment's *signed URL* lapses after about a day, but the
  attachment's underlying data does not expire either, so this is not a
  meaningful difference from what Discord already does. Framing it as a
  benefit of the link is misleading in the direction that makes the feature
  look safer than it is.

- The fragment also lands in browser history, gets synced across devices by a
  signed-in Chrome user, and sits fully visible in the address bar during a
  screenshare — none of which apply to opening the attachment in Discord.
