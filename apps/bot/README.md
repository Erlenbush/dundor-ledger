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
3. Invite it with the scopes `bot` and permissions View Channels, Send
   Messages, Read Message History.
4. Run it:

```
npm install
npm run build
DISCORD_TOKEN=... npm run start -w @dundor/bot
```

`DUNDOR_APP_ID` overrides which application counts as Dundor; it defaults to
the public id 1284876985822216232.

For a long-running deployment, `dundor-bot.service` is an example systemd unit
and `.env.example` shows the environment file. The bot needs Node 20 or newer.

To preview the reply for a log without Discord:

```
npm run dry -w @dundor/bot -- fixtures/fungus-creature-loss-xl63.txt
```
