# Dundor Ledger bot on bespin — manual steps

Everything that can be scripted lives in `deploy/deploy-bot.sh`. This document
covers only the steps a script cannot do: the Discord developer portal clicks,
the secret, and the systemd unit (bespin has a guard that blocks agent writes to
`/etc/systemd/system`, so that step is yours by design).

Host: `bespin` (159.223.198.240, root via `~/.ssh/id_ed25519_bespin`).
Deployed to: `/home/dundor/dundor-ledger`, running as the `dundor` system user.
Application ID: `1534422776914382859` (public identifier, not a secret).

**Status: live since 2026-08-05 06:24 UTC.** The bot is logged in as
`Dundor Ledger#5231` and running under systemd with 0 restarts. What remains is
getting it into the server, which depends on the Dundor developer.

## Done

- [x] Install Node 22 from NodeSource (apt on Ubuntu 24.04 only offers Node 18; the bot needs 20+)
- [x] Create the `dundor` system user with home `/home/dundor`
- [x] Ship the repo to `/home/dundor/dundor-ledger` with prebuilt `dist/`
- [x] `npm ci --omit=dev` for production dependencies
- [x] Enable the Message Content Intent in the developer portal
- [x] Put the bot token in `apps/bot/.env`, mode 0600, owned by `dundor`
- [x] Install the systemd unit and `systemctl enable --now dundor-bot`
- [x] Confirm a clean gateway login and a stable service (`NRestarts=0`, no journal warnings)

## Remaining steps

### 4. Get the bot invited to the server

The bot is running but is not in any server yet. Inviting it requires the
Dundor developer, since it is their server.

- [ ] Send the developer this invite URL ⏫

```
https://discord.com/oauth2/authorize?client_id=1534422776914382859&scope=bot&permissions=84992
```

`84992` = View Channels (1024) + Send Messages (2048) + Embed Links (16384) +
Read Message History (65536).

- [ ] Ask them to confirm the grant survives in the channels where Dundor posts, if the server uses per-channel permission overrides
- [ ] Ask them to confirm Dundor's application ID ⏫

  The bot only auto-analyzes attachments from the app matching `DUNDOR_APP_ID`,
  which defaults to `1284876985822216232`. If that ID is wrong for their current
  deployment, the bot sits in the channel doing nothing, with no error. If they
  give a different ID, uncomment and set `DUNDOR_APP_ID` in `apps/bot/.env` and
  run `systemctl restart dundor-bot`.

- [ ] Ask them to whitelist this bot as a command source, for `!ledger pull`

  Bots cannot invoke other bots' commands and Dundor normally ignores bot
  messages, so `!ledger pull` only closes the loop with that whitelist. Without
  it the feature is inert — auto-analysis still works, but a human has to type
  `dun logs get n`. Worth asking while you have their attention; otherwise it
  costs a second round-trip.

### 5. Smoke test in Discord

- [ ] Upload a saved Dundor `.txt` battle log to a channel the bot can see
- [ ] Confirm it replies with a summary embed

Use a fixture from the repo if you don't have a fresh log handy, e.g.
`fixtures/fungus-creature-loss-xl63.txt`.

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

- `Unauthorized` / `TOKEN_INVALID` → wrong or rotated token
- `Used disallowed intents` → Message Content Intent got switched off
- `Missing Permissions` → the invite lacked Embed Links; see below

## Two gotchas that cost us time

**The public key is not the token.** The portal's General Information page
shows a 64-character lowercase-hex Public Key. The bot token is on the **Bot**
page and looks completely different: ~72 characters in three dot-separated
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

- bespin also runs `nginx`, `ge-api`, and `ge-detector` (the OSRS GE tracker,
  Python under `/opt/ge-tracker`). The bot shares nothing with them — it is a
  Node process with no ports and no inbound traffic — but the box only has
  961 MB of RAM, which is why the deploy script builds locally and ships
  `dist/` rather than compiling on the droplet. The bot's resident set is
  about 108 MB.

- The web app is unrelated to this host. It deploys to Cloudflare Workers via
  `npm run deploy` from the repo root.
