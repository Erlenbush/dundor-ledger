/**
 * Dundor Ledger bot.
 *
 * Sits in a server alongside Dundor. When Dundor posts a battle log as a .txt
 * attachment (after someone runs `dun logs get N`), this bot downloads it,
 * parses it with @dundor/parser, and replies with a summary embed.
 *
 * It also answers a command of its own:
 *
 *   !ledger pull [n]   posts the text "dun logs get n" as an ordinary message
 *
 * Discord bots cannot invoke another bot's commands, and Dundor normally
 * ignores messages from bots, so `pull` only closes the loop if the Dundor
 * developer has whitelisted this bot as a command source. If not, the message
 * is harmless and a human types the command instead; the auto-analysis of the
 * resulting attachment works either way.
 *
 * Environment:
 *   DISCORD_TOKEN   required, the bot token
 *   DUNDOR_APP_ID   optional, Dundor's application id
 *                   (defaults to the public id 1284876985822216232)
 *   LEDGER_PULL_COOLDOWN_SECONDS
 *                   optional, per-user cooldown on `!ledger pull`
 *                   (defaults to 30; 0 disables it)
 */
import { Client, GatewayIntentBits, type Message } from 'discord.js';
import { exportFights, type ExportedFight } from '@dundor/parser';
import { formatFight } from './format.js';
import { Cooldown } from './cooldown.js';

const TOKEN = process.env['DISCORD_TOKEN'];
const DUNDOR_ID = process.env['DUNDOR_APP_ID'] ?? '1284876985822216232';
const MAX_EMBEDS = 3;

// `pull` relays into Dundor's command handler, so it is rate limited per user.
// Anything unparseable falls back to the default rather than disabling the limit.
const COOLDOWN_RAW = Number(process.env['LEDGER_PULL_COOLDOWN_SECONDS']);
const COOLDOWN_SECONDS =
  Number.isFinite(COOLDOWN_RAW) && COOLDOWN_RAW >= 0 ? COOLDOWN_RAW : 30;
const pullCooldown = new Cooldown(COOLDOWN_SECONDS * 1000);

if (!TOKEN) {
  console.error('DISCORD_TOKEN is not set.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Needed to see attachments and read the !ledger command. Enable
    // "Message Content Intent" for the bot in the developer portal.
    GatewayIntentBits.MessageContent,
  ],
});

async function analyzeAttachments(msg: Message): Promise<void> {
  const texts = [...msg.attachments.values()].filter(
    (att) => att.name.toLowerCase().endsWith('.txt') && att.size < 2_000_000,
  );
  if (!texts.length) return;

  const fights: ExportedFight[] = [];
  for (const att of texts) {
    const res = await fetch(att.url);
    if (!res.ok) {
      console.error(`failed to download ${att.name}: ${res.status}`);
      continue;
    }
    const body = await res.text();
    for (const entry of exportFights(body, att.name)) {
      if ('error' in entry) console.error(`${att.name}: ${entry.error}`);
      else fights.push(entry);
    }
  }
  if (!fights.length) return;

  const shown = fights.slice(0, MAX_EMBEDS);
  const skipped = fights.length - shown.length;
  await msg.reply({
    embeds: shown.map((f) => {
      const e = formatFight(f);
      return {
        title: e.title,
        description: e.description,
        color: e.color,
        fields: e.fields,
        footer: { text: e.footer },
      };
    }),
    ...(skipped > 0
      ? { content: `Showing ${shown.length} of ${fights.length} fights.` }
      : {}),
    allowedMentions: { repliedUser: false },
  });
}

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.id === client.user?.id) return;

    // Dundor posting a log: analyze it on the spot.
    if (msg.author.bot && msg.author.id === DUNDOR_ID) {
      await analyzeAttachments(msg);
      return;
    }

    // A human asking us to pull a log for them.
    if (!msg.author.bot) {
      const m = msg.content.trim().match(/^!ledger\s+pull(?:\s+(\d+))?$/i);
      if (m) {
        const gate = pullCooldown.check(msg.author.id, Date.now());
        if (!gate.allowed) {
          // Only the first blocked attempt gets an answer; replying to every
          // one would turn one person's spam into two people's spam.
          if (gate.notify) {
            const secs = Math.ceil(gate.retryAfterMs / 1000);
            await msg.reply(`Hold on ${secs}s before pulling again.`);
          }
          return;
        }
        await msg.channel.send(`dun logs get ${m[1] ?? '1'}`);
        return;
      }
      // Humans re-uploading a saved log get the same treatment as Dundor.
      await analyzeAttachments(msg);
    }
  } catch (err) {
    console.error('handler failed:', err);
  }
});

client.once('clientReady', () => {
  console.log(`logged in as ${client.user?.tag}, watching for Dundor (${DUNDOR_ID}) logs`);
});

client.login(TOKEN);
