# Dundor Ledger bot

Watches a server for the .txt battle logs Dundor attaches, parses them with
`@dundor/parser`, and replies with a summary embed. Humans can also upload a
saved log and get the same reply.

`!ledger pull [n]` posts the text `dun logs get n`. Bots cannot invoke other
bots' commands and Dundor normally ignores bot messages, so this only closes
the loop if the Dundor developer whitelists this bot as a command source.
Without that, a human types the command and the auto-analysis still works.

## Setup

1. Create an application at discord.com/developers, add a bot, copy the token.
2. On the Bot page enable the "Message Content Intent".
3. Invite it with the scope `bot` and permissions View Channels, Send
   Messages, Embed Links, Read Message History. Embed Links is not optional:
   the reply is an embed, so without it the bot connects, reads the log, and
   then fails every reply with `Missing Permissions`. That bitfield is 84992:

   ```
   https://discord.com/oauth2/authorize?client_id=<app id>&scope=bot&permissions=84992
   ```

   If the server uses per-channel permission overrides, check the grant
   survives in the channels where Dundor posts.
4. Run it:

```
npm install
npm run build
DISCORD_TOKEN=... npm run start -w @dundor/bot
```

`DUNDOR_APP_ID` overrides which application counts as Dundor; it defaults to
the public id 1284876985822216232.

`LEDGER_PULL_COOLDOWN_SECONDS` sets the per-user cooldown on `!ledger pull`,
defaulting to 30. `pull` is the one command that speaks into another bot's
command handler, so it is rate limited to keep this bot from becoming a spam
relay pointed at Dundor. The window runs from the last accepted pull, so
hammering the command cannot extend your own lockout, and only the first
blocked attempt gets a reply. Set it to 0 to disable the limit.

`LEDGER_WEB_URL` is the base URL of the web UI, for example
`https://dundor-ledger.example.workers.dev`. When it is set, replies carry an
"Open full breakdown" button that opens the same fight in the browser, with the
log gzipped into the URL fragment. Fragments are never sent to a server, so the
log reaches neither the host nor its logs. When the variable is unset there is
no button. Logs too large to fit link to the bare site instead.

For a long-running deployment, `dundor-bot.service` is an example systemd unit
and `.env.example` shows the environment file. The bot needs Node 20 or newer.

To preview the reply for a log without Discord:

```
npm run dry -w @dundor/bot -- "$PWD/fixtures/fungus-creature-loss-xl63.txt"
```

The path has to be absolute: `npm -w` runs the script from `apps/bot`, so a
repo-relative path resolves against the wrong directory.
