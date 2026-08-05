# Dundor Ledger bot on bespin — manual steps

Everything that can be scripted lives in `deploy/deploy-bot.sh`. This document
covers only the steps a script cannot do: the Discord developer portal clicks,
the secret, the systemd unit (bespin has a guard that blocks agent writes to
`/etc/systemd/system`, so that step is yours by design), and anything that
depends on the Dundor developer.

Host: `bespin` (159.223.198.240, root via `~/.ssh/id_ed25519_bespin`).
Deployed to: `/home/dundor/dundor-ledger`, running as the `dundor` system user.
Application ID: `1534422776914382859` (public identifier, not a secret).

**Status: live since 2026-08-05 06:24 UTC**, logged in as `Dundor Ledger#5231`
and running under systemd. Currently pointed at **Staging Dundor**.

## Done

- [x] Install Node 22 from NodeSource (apt on Ubuntu 24.04 only offers Node 18; the bot needs 20+)
- [x] Create the `dundor` system user with home `/home/dundor`
- [x] Ship the repo to `/home/dundor/dundor-ledger` with prebuilt `dist/`
- [x] `npm ci --omit=dev` for production dependencies
- [x] Enable the Message Content Intent in the developer portal
- [x] Put the bot token in `apps/bot/.env`, mode 0600, owned by `dundor`
- [x] Install the systemd unit and `systemctl enable --now dundor-bot`
- [x] Confirm a clean gateway login and a stable service (`NRestarts=0`, no journal warnings)
- [x] Rate limit `!ledger pull` per user, so the bot cannot be used as a spam relay
- [x] Confirm Dundor's production application ID with the developer
- [x] Point the deployment at Staging Dundor

## Which Dundor the bot watches

`DUNDOR_APP_ID` in `apps/bot/.env` decides which application counts as Dundor.
Change it and `systemctl restart dundor-bot`.

| Environment | Application ID |
| --- | --- |
| Staging Dundor (current) | `1344251040970571818` |
| Production Dundor | `1284876985822216232` |

Running staging and production at the same time would need a **second Discord
application** with its own token. Two processes sharing one token in one server
answer every log twice.

**Decided 2026-08-05:** stay on one application until rollout. At rollout, point
this deployment at production and register a separate application for
development. A second application before there are users to serve is overhead
for nothing.

At rollout the switch is two commands on bespin:

```bash
sed -i 's/^DUNDOR_APP_ID=.*/DUNDOR_APP_ID=1284876985822216232/' \
  /home/dundor/dundor-ledger/apps/bot/.env
systemctl restart dundor-bot
```

The startup log line names the ID it is watching, so `journalctl -u dundor-bot
-n 1` confirms it took.

The development bot does not need a second service on this droplet. It can run
on devbuntu against its own token, which keeps the 961 MB box serving one
process:

```bash
cd ~/dundor-ledger
DISCORD_TOKEN=<dev token> DUNDOR_APP_ID=1344251040970571818 \
  npm run start -w @dundor/bot
```

The new application needs the same setup as this one: Message Content Intent
enabled, and an invite carrying permissions `84992`. The token and public key
warning below applies again.

To read those IDs off Discord yourself: enable Developer Mode in Discord
settings, then right click the bot and Copy User ID.

## Remaining steps

### 4. Get the bot invited to the server

- [ ] Confirm the bot is actually in the server, and in the channels where Dundor posts

```
https://discord.com/oauth2/authorize?client_id=1534422776914382859&scope=bot&permissions=84992
```

`84992` = View Channels (1024) + Send Messages (2048) + Embed Links (16384) +
Read Message History (65536). If the server uses per channel overrides, check
the grant survives in the channels that matter.

### 5. Switch `!ledger pull` over to Dundor's HTTP API

This replaces the original design, which is dead. See "Why the whitelist
approach was abandoned" below.

**Agreed with the Dundor developer:**

- Dundor already exposes HTTP endpoints (nold and event shop stocks), so adding one for logs is cheap on their side
- The API returns exactly two things: a list of all logs as seen in `dun logs`, and one log `.txt` file from `dun logs` as requested, in the same format
- Same format is the critical part. `@dundor/parser` and every fixture already consume that text, so no second parser is needed
- Only the owner may read their own logs. Letting people read other users' logs was offered and declined, since there is no use case for it
- Access is opt in per user, via a `dun settings` toggle along the lines of "Allow 3rd party Dundor Ledger to read your logs via the API"

**Still waiting on the developer:**

- [ ] A 403 with a reason field, so "hasn't opted in" is distinguishable from "no logs" and "unknown user" ⏫

  Without it, a user who has not flipped the toggle sees "no logs found",
  assumes the bot is broken, and reports it to the Dundor developer rather than
  discovering the setting.

- [ ] How to authenticate (API key in a header is fine)
- [ ] Base URLs, and whether staging and production are separate hosts
- [ ] What each entry in the log list looks like, and what identifier gets passed back to fetch a specific one ⏫

  This one blocks the command's design. `!ledger pull 3` currently means "the
  third most recent", and whether that maps to an index or an opaque ID changes
  how it is written.

- [ ] Any rate limit they want respected (we are already capped at one pull per user per 30 seconds)
- [ ] Explicit agreement on the trust model ⏫

  The bot calls the API with the Discord ID of whoever ran the command, so
  Dundor is trusting this bot to send the right one. "Owner views own logs"
  sounds airtight until you notice which side asserts who the owner is. The opt
  in toggle is what makes it safe, not anything on our end. Better agreed now
  than discovered later.

**Our side, once those land:**

- Two new environment variables for the API base URL and key
- `!ledger pull` calls the API instead of posting `dun logs get` into the channel
- A 403 branch that tells the user to run `dun settings` and enable API access
- The per-user cooldown stays. It now protects Dundor's API rather than its command handler, which is arguably where it mattered more
- Auto-analysis of `.txt` attachments is unchanged and keeps working regardless
- **Logs must not be persisted.** They are parsed in memory and posted back as an embed, nothing is written to disk. This was stated to the developer as a reason the access is low risk, and it needs to stay true. Adding any caching means going back and saying so.

### 6. Smoke test in Discord

- [ ] Upload a saved Dundor `.txt` battle log to a channel the bot can see
- [ ] Confirm it replies with a summary embed

Use a fixture from the repo if you don't have a fresh log handy, e.g.
`fixtures/fungus-creature-loss-xl63.txt`.

## Why the whitelist approach was abandoned

The original `!ledger pull` posted the literal text `dun logs get n` into the
channel, hoping Dundor would treat it as a command. That needed the Dundor
developer to whitelist this bot as a command source.

Two things came out of asking:

1. Bot to bot was never the blocker. The developer already lets Eric's Dundor Helper use some commands, so it was clearly possible.
2. The actual blocker was attribution. `dun logs` resolves against whoever sent the message, and it will not look up other users. So a whitelist would have made Dundor return *this bot's* logs, which are empty. The feature would have been granted and still been useless.

An HTTP endpoint that takes a user ID solves the attribution problem directly,
so the whitelist is not needed and should not be asked for.

Worth remembering as a pattern: the question that killed this design ("does the
command resolve against the sender?") was cheaper to ask than the permission
would have been to grant.

## Redeploying later

Updates are one command from the repo root on devbuntu:

```bash
./deploy/deploy-bot.sh
```

It rebuilds, ships, reinstalls production dependencies, verifies the build, and
restarts the service. It never touches `.env` or the unit file.

## Troubleshooting

```bash
systemctl status dundor-bot --no-pager
journalctl -u dundor-bot -n 50 --no-pager
systemctl show dundor-bot -p NRestarts --value   # climbing = crash loop
```

`RestartSec=10` means a bad token loops quietly every ten seconds rather than
failing loudly, so check `NRestarts` rather than trusting `active (running)`
right after a start.

- `Unauthorized` / `TOKEN_INVALID` means a wrong or rotated token
- `Used disallowed intents` means the Message Content Intent got switched off
- `Missing Permissions` means the invite lacked Embed Links
- Bot sits silently and never reacts: usually `DUNDOR_APP_ID` pointing at the wrong Dundor. The startup log line names the ID it is watching.

## Two gotchas that cost us time

**The public key is not the token.** The portal's General Information page
shows a 64 character lowercase hex Public Key. The bot token is on the **Bot**
page and looks completely different: about 72 characters in three dot separated
parts, mixed case, with `_` and `-`. A gateway bot never uses the public key at
all. Pasting the wrong one yields a crash loop with a bare `Unauthorized`,
which gives no hint that the wrong *kind* of credential is in the file. To
check the shape without printing the secret:

```bash
awk -F= '/^DISCORD_TOKEN=/{v=substr($0,index($0,"=")+1);
  printf "len=%d parts=%d\n", length(v), split(v,a,".")}' \
  /home/dundor/dundor-ledger/apps/bot/.env
# want: len=~72 parts=3
```

**Embed Links is mandatory.** The reply is an embed (`apps/bot/src/index.ts`),
so without that permission the bot connects, reads the log, and then fails
every reply with `Missing Permissions`. The bot's own README listed only three
permissions and omitted it; fixed in commit `3cb896c`. Getting this wrong means
going back to the other developer for a re-invite.

## Notes

- The bot has no `dotenv` dependency; it reads `process.env` directly. The
  `.env` file therefore only takes effect through systemd's `EnvironmentFile`.
  To run it by hand for debugging, load the file yourself:

  ```bash
  cd /home/dundor/dundor-ledger
  set -a; . apps/bot/.env; set +a
  sudo -u dundor -E /usr/bin/node apps/bot/dist/index.js
  ```

- `apps/bot/.env.example` is covered by the global `protect-files` hook, so
  agents cannot edit it. New settings have to be added there by hand. It is
  currently missing `LEDGER_PULL_COOLDOWN_SECONDS`.

- bespin also runs `nginx`, `ge-api`, and `ge-detector` (the OSRS GE tracker,
  Python under `/opt/ge-tracker`). The bot shares nothing with them. It is a
  Node process with no ports and no inbound traffic. The box only has 961 MB of
  RAM, which is why the deploy script builds locally and ships `dist/` rather
  than compiling on the droplet. The bot's resident set is about 108 MB.

- The web app is unrelated to this host. It deploys to Cloudflare Workers via
  `npm run deploy` from the repo root.
