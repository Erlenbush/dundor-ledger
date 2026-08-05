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
import { MAX_ATTACHMENT_BYTES, problemReport, type LogProblem } from './problems.js';

const TOKEN = process.env['DISCORD_TOKEN'];
const DUNDOR_ID = process.env['DUNDOR_APP_ID'] ?? '1284876985822216232';
const MAX_EMBEDS = 3;

// `pull` relays into Dundor's command handler, so it is rate limited per user.
// Anything unparseable falls back to the default rather than disabling the limit.
const COOLDOWN_RAW = Number(process.env['LEDGER_PULL_COOLDOWN_SECONDS']);
const COOLDOWN_SECONDS =
  Number.isFinite(COOLDOWN_RAW) && COOLDOWN_RAW >= 0 ? COOLDOWN_RAW : 30;
const pullCooldown = new Cooldown(COOLDOWN_SECONDS * 1000);

// Failure notices are rate limited too. Someone pasting the same bad file
// repeatedly should not get a complaint every time.
const problemCooldown = new Cooldown(60_000);

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

/** True when a message is one we owe an answer to, successful or not. */
function hasLogAttachment(msg: Message): boolean {
  return [...msg.attachments.values()].some((att) => att.name.toLowerCase().endsWith('.txt'));
}

/**
 * Tell someone their upload failed, at most once per window.
 *
 * Never throws: this runs on the failure path, and a bot that cannot report a
 * problem must not turn that into a second problem.
 */
async function reportProblem(msg: Message, text: string): Promise<void> {
  try {
    if (!problemCooldown.check(msg.author.id, Date.now()).allowed) return;
    await msg.reply({ content: text, allowedMentions: { repliedUser: false } });
  } catch (err) {
    console.error('could not report a problem:', err);
  }
}

async function analyzeAttachments(msg: Message): Promise<void> {
  // Anything that is not a .txt stays silent on purpose. People post
  // screenshots and unrelated files constantly, and a bot that answers every
  // one of them is a nuisance.
  const candidates = [...msg.attachments.values()].filter((att) =>
    att.name.toLowerCase().endsWith('.txt'),
  );
  if (!candidates.length) return;

  const problems: LogProblem[] = [];
  const fights: ExportedFight[] = [];

  for (const att of candidates) {
    if (att.size >= MAX_ATTACHMENT_BYTES) {
      problems.push({ kind: 'oversized', name: att.name, size: att.size });
      continue;
    }

    const res = await fetch(att.url);
    if (!res.ok) {
      console.error(`failed to download ${att.name}: ${res.status}`);
      problems.push({ kind: 'download', name: att.name, status: res.status });
      continue;
    }

    const body = await res.text();
    let parsedHere = 0;
    for (const entry of exportFights(body, att.name)) {
      if ('error' in entry) console.error(`${att.name}: ${entry.error}`);
      else {
        fights.push(entry);
        parsedHere++;
      }
    }
    // Every chunk failed, so the file was a .txt but not a battle log.
    if (parsedHere === 0) problems.push({ kind: 'unparsed', name: att.name });
  }

  if (!fights.length) {
    const report = problemReport(problems, false);
    if (report) await reportProblem(msg, report);
    return;
  }

  const shown = fights.slice(0, MAX_EMBEDS);
  const skipped = fights.length - shown.length;
  // A single fight gets every insight in full. Several in one reply would be a
  // wall of text, so those fall back to headlines and say how to get the rest.
  const detailed = fights.length === 1;
  const fightNote = detailed
    ? null
    : skipped > 0
      ? `Showing ${shown.length} of ${fights.length} fights. Upload one on its own for the full breakdown.`
      : `${fights.length} fights. Upload one on its own for the full breakdown.`;
  // Part of the upload may still have failed even though we have something to
  // show, so mention it alongside the embeds rather than dropping it.
  const note = [fightNote, problemReport(problems, true)].filter(Boolean).join('\n\n') || null;
  await msg.reply({
    embeds: shown.map((f) => {
      const e = formatFight(f, detailed);
      return {
        title: e.title,
        description: e.description,
        color: e.color,
        fields: e.fields,
        footer: { text: e.footer },
      };
    }),
    ...(note ? { content: note } : {}),
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
    // Only answer if they were owed one. An unrelated message that happened to
    // throw should not get a reply out of nowhere.
    if (hasLogAttachment(msg)) {
      await reportProblem(msg, 'Something went wrong on my end reading that log. Try again.');
    }
  }
});

client.once('clientReady', () => {
  console.log(`logged in as ${client.user?.tag}, watching for Dundor (${DUNDOR_ID}) logs`);
});

client.login(TOKEN);
