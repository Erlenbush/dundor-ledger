# Log link button — manual steps

Companion to `docs/superpowers/specs/2026-08-05-log-link-design.md`. Covers only
the steps that cannot be scripted: the interactive Cloudflare login, the Discord
probe, and the environment variable on bespin.

**These steps apply once the feature is implemented.** The spec is designed but
not built. Nothing here works yet.

The feature ships dark: with `LEDGER_WEB_URL` unset there is no button and the
bot behaves exactly as it does today. Do these steps in order, and stop at any
point without leaving things broken.

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

## 2. Find Discord's component URL ceiling

Discord does not document a maximum length for a link button's URL, and
`discord.js` does not enforce one. The probe finds it empirically.

- [ ] Create or pick a **private channel of your own** ⏫

Not Pearguson's server. The probe posts several throwaway messages.

- [ ] Get the channel ID

Enable Developer Mode in Discord settings (User Settings, Advanced), then right
click the channel and Copy Channel ID.

- [ ] Run the probe

```bash
cd ~/dundor-ledger
DISCORD_TOKEN=<your bot token> node scripts/probe-button-url.mjs <channel id>
```

It posts buttons at increasing URL lengths and prints the largest that Discord
accepted.

- [ ] Record the number, then delete the probe messages

## 3. Set the budget constant

- [ ] Put the measured ceiling into `apps/bot/src/link.ts`, minus a safety margin

Leave headroom rather than sitting exactly on the limit. If the constant is
wrong the bot retries without the button, so a fight loses its link but the
analysis still posts. That backstop is not a reason to skip the margin.

- [ ] Run the tests and deploy

```bash
npm test
./deploy/deploy-bot.sh
```

## 4. Turn the button on

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

## 5. Verify

- [ ] Upload a small log and confirm the button appears

`fixtures/snake-xl100.txt` encodes to roughly 1,500 characters, well inside any
plausible limit.

- [ ] Click it and confirm the fight opens with charts

- [ ] Upload the largest fixture and confirm the oversized path

`fixtures/fungus-creature-loss-xl63.txt` encodes to roughly 4,634 characters. If
that is over your measured ceiling, the button should point at the bare site and
the embed should say the fight was too long to link directly. Either outcome is
correct; what must not happen is a missing reply.

- [ ] Upload `fixtures/two-fights-one-paste.txt` and confirm the browser shows
      both fights, not just the embed's first three

## Rolling back

Remove or comment out `LEDGER_WEB_URL` and restart. The button disappears and
nothing else changes.

## Notes

- The log travels inside the URL fragment, after the `#`. Fragments are never
  sent in an HTTP request, so the log never reaches Cloudflare and never appears
  in an access log. This is why the approach does not contradict what was told
  to the Dundor developer about logs not being persisted.

- Anyone holding a link holds that log. This is not new exposure, since the
  attachment is in the same channel, but it is worth knowing before sharing
  links outside the server.

- The links do not expire. They are self-contained and keep working as long as
  the site is published, unlike Discord attachment URLs which are signed and
  lapse after about a day.
