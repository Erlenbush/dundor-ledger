# Dundor Ledger bot on bespin — manual steps

Everything that can be scripted lives in `deploy/deploy-bot.sh`. This document
covers only the steps a script cannot do: the Discord developer portal clicks,
the secret, and the systemd unit (bespin has a guard that blocks agent writes to
`/etc/systemd/system`, so that step is yours by design).

Host: `bespin` (159.223.198.240, root via `~/.ssh/id_ed25519_bespin`).
Deployed to: `/home/dundor/dundor-ledger`, running as the `dundor` system user.

## Already done

These are complete on bespin as of 2026-08-05 — listed so you know what not to redo.

- [x] Install Node 22 from NodeSource (apt on Ubuntu 24.04 only offers Node 18; the bot needs 20+)
- [x] Create the `dundor` system user with home `/home/dundor`
- [x] Ship the repo to `/home/dundor/dundor-ledger` with prebuilt `dist/`
- [x] `npm ci --omit=dev` for production dependencies
- [x] Stage `apps/bot/.env` from the template, mode 0600, owned by `dundor`
- [x] Verify the built bot runs (dry run against a fixture succeeds; `index.js` exits cleanly with `DISCORD_TOKEN is not set.`)

## Remaining steps

### 1. Get the bot token from the Discord developer portal

- [ ] Go to <https://discord.com/developers/applications> and open (or create) the Dundor Ledger application
- [ ] Open the **Bot** page and enable the **Message Content Intent** ⏫ — without it the bot receives empty message bodies and can never see the log attachments
- [ ] Click **Reset Token**, then copy the token. It is shown exactly once
- [ ] Invite the bot with scope `bot` and permissions **View Channels**, **Send Messages**, **Read Message History**

The token is the only secret. The application ID and public key on the portal
are public identifiers, and a gateway bot never uses the public key.

### 2. Put the token on bespin

- [ ] Write the token into the staged env file ⏫

```bash
ssh bespin
nano /home/dundor/dundor-ledger/apps/bot/.env
```

Replace `paste-bot-token-here` so the line reads `DISCORD_TOKEN=<your token>`.
Leave `DUNDOR_APP_ID` commented out unless you need to point at a different
application than the default `1284876985822216232`.

- [ ] Confirm the permissions survived editing (some editors rewrite the file):

```bash
chown dundor:dundor /home/dundor/dundor-ledger/apps/bot/.env
chmod 600 /home/dundor/dundor-ledger/apps/bot/.env
ls -l /home/dundor/dundor-ledger/apps/bot/.env   # expect -rw------- dundor dundor
```

`deploy/deploy-bot.sh` excludes `.env` from rsync, so this file survives every
future redeploy. You only do this once.

### 3. Install the systemd unit

Run these on bespin as root. The unit is already on the box at
`/home/dundor/dundor-ledger/apps/bot/dundor-bot.service`, and its paths already
match the deployment — no editing needed.

- [ ] Install and start the service ⏫

```bash
cp /home/dundor/dundor-ledger/apps/bot/dundor-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dundor-bot
```

- [ ] Confirm it came up:

```bash
systemctl status dundor-bot --no-pager
journalctl -u dundor-bot -n 50 --no-pager
```

A healthy start logs the bot's gateway login. If it restarts in a loop, the
usual causes are a bad token (`Unauthorized` / `TOKEN_INVALID`) or the Message
Content Intent still being off (`Used disallowed intents`).

### 4. Smoke test in Discord

- [ ] Upload a saved Dundor `.txt` battle log to a channel the bot can see
- [ ] Confirm it replies with a summary embed

Use a fixture from the repo if you don't have a fresh log handy, e.g.
`fixtures/fungus-creature-loss-xl63.txt`.

## Redeploying later

Once the above is done, updates are one command from the repo root on devbuntu:

```bash
./deploy/deploy-bot.sh
```

It rebuilds, ships, reinstalls production dependencies, verifies the build, and
restarts the service. It never touches `.env` or the unit file.

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
  `dist/` rather than compiling on the droplet.

- The web app is unrelated to this host. It deploys to Cloudflare Workers via
  `npm run deploy` from the repo root.
