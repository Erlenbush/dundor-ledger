#!/usr/bin/env node
/**
 * Find the longest link-button URL Discord will accept.
 *
 * Discord does not document a ceiling and discord.js does not enforce one, so
 * MAX_LINK_CHARS in apps/bot/src/link.ts is a guess until this measures it.
 *
 * Posts throwaway messages. Point it at a private channel of your own, not at
 * anyone else's server, and delete them afterwards.
 *
 *   DISCORD_TOKEN=... node scripts/probe-button-url.mjs <channel id>
 */

const token = process.env.DISCORD_TOKEN;
const channel = process.argv[2];

if (!token || !channel) {
  console.error('Usage: DISCORD_TOKEN=... node scripts/probe-button-url.mjs <channel id>');
  process.exit(1);
}

const PREFIX = 'https://example.com/#log=g1.';
const LENGTHS = [512, 1024, 2000, 3000, 4000, 5000, 6000, 8000];
const posted = [];

async function attempt(length) {
  // base64url alphabet, so the probe URL looks like a real one.
  const url = `${PREFIX}${'a'.repeat(Math.max(0, length - PREFIX.length))}`;
  const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `probe ${length}`,
      components: [
        { type: 1, components: [{ type: 2, style: 5, label: `probe ${length}`, url }] },
      ],
    }),
  });
  if (res.ok) {
    posted.push((await res.json()).id);
    return { ok: true };
  }
  return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
}

let best = 0;
try {
  for (const length of LENGTHS) {
    const out = await attempt(length);
    console.log(`${String(length).padStart(5)}  ${out.ok ? 'accepted' : `REJECTED ${out.status} ${out.body}`}`);
    if (!out.ok) break;
    best = length;
    // Discord allows 5 messages per 5 seconds per channel.
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`\nLargest accepted URL length: ${best}`);
  console.log('Set MAX_LINK_CHARS below this, leaving a margin.');
} finally {
  // Always clean up, even if the sweep threw an error.
  const failed = [];
  for (const id of posted) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bot ${token}` },
      });
      if (!res.ok) {
        failed.push(id);
        console.error(`Failed to delete message ${id}: ${res.status}`);
      }
    } catch (e) {
      failed.push(id);
      console.error(`Error deleting message ${id}: ${e.message}`);
    }
    // Discord allows 5 messages per 5 seconds per channel.
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (failed.length === 0) {
    console.log(`Cleaned up ${posted.length} probe messages.`);
  } else {
    console.error(`Cleaned up ${posted.length - failed.length}/${posted.length} messages.`);
    console.error(`Left behind: ${failed.join(', ')}`);
  }
}
