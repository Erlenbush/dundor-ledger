#!/usr/bin/env node
/**
 * Find the longest link-button URL Discord will accept.
 *
 * ANSWERED 2026-08-05: 512 characters ("Must be 512 or fewer in length"). The
 * smallest real log needs about 1,545, so a link button can never carry one.
 * The bot puts the log in a markdown link in the embed description instead,
 * which accepts at least 4,000.
 *
 * Kept because it is the tool for re-measuring if Discord moves that ceiling,
 * but note it probes the BUTTON limit, which is no longer the vehicle in use.
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

// Fine steps through the range that matters, coarser beyond it. The smallest
// real fixture (snake-xl100.txt) needs about 1,550 URL characters with a
// production-length base -- see REALISTIC_MINIMUM below -- so this is dense
// from 1,024 to 2,000 rather than jumping straight from 1,024 to 2,000 as a
// single step, which would leave that entire range unmeasured.
const LENGTHS = [
  512, 768, 1024, 1152, 1280, 1408, 1536, 1600, 1664, 1792, 2000, 2500, 3000, 4000, 5000, 6000,
  8000,
];

// The smallest real log a reader will ever click through. Below this, no
// fixture the bot actually handles produces a link that fits, regardless of
// what MAX_LINK_CHARS is set to.
const REALISTIC_MINIMUM = 1_550;

const posted = [];

/**
 * A representative embed, standing in for the ones `buildReply` actually
 * sends alongside the button.
 *
 * The first version of this probe posted `content` plus a bare button and
 * nothing else. A real reply carries up to three embeds (apps/bot/src/reply.ts's
 * MAX_EMBEDS) totalling as much as Discord's ~6,000 character embed budget. If
 * Discord's real constraint on a link button turns out to be the size of the
 * whole payload rather than the `url` field alone, a probe that never sends
 * anything but the button would measure a ceiling that does not hold once the
 * embeds are back -- reporting a number safe in isolation but wrong in
 * production. One ~5,000-character embed here does not reproduce three
 * embeds exactly, but it is far closer than measuring the button alone, and
 * simple enough to keep this script a probe rather than a copy of buildReply.
 */
function representativeEmbed() {
  const filler = (label, length) =>
    Array.from({ length: Math.ceil(length / (label.length + 1)) }, () => label).join(' ').slice(0, length);

  // Discord caps a single embed field value at 1024 characters (apps/bot/src/format.ts's
  // own FIELD_VALUE_LIMIT), so several fields near that cap, not one huge one,
  // is what a real detailed-mode embed actually looks like.
  return {
    title: 'Victory: SomePlayer vs SomeMonster',
    description: filler('Turn-by-turn line describing a swing, a save, and the HP left after it.', 1000),
    color: 0x1f7a4d,
    fields: [
      { name: '🔴 Some insight tag', value: filler('Headline sentence, then a body explaining the roll behind it.', 950), inline: false },
      { name: '🟠 Another insight tag', value: filler('A second insight body, about the same size as the first.', 950), inline: false },
      { name: '🟢 A third insight tag', value: filler('A third insight body, again about the same size.', 950), inline: false },
      { name: '⚪ A fourth insight tag', value: filler('A fourth insight body, rounding this out to a realistic total.', 950), inline: false },
      { name: 'Damage', value: '1234 dealt / 987 taken', inline: true },
      { name: 'Mitigated', value: '42.3%', inline: true },
      { name: 'Hit rate', value: '18/22 (expected 19.4)', inline: true },
    ],
    footer: { text: '312 events parsed from probe.txt' },
  };
}

async function attempt(length) {
  // base64url alphabet, so the probe URL looks like a real one.
  const url = `${PREFIX}${'a'.repeat(Math.max(0, length - PREFIX.length))}`;
  const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `probe ${length}`,
      embeds: [representativeEmbed()],
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
  // A plain "0 / set MAX_LINK_CHARS below this" is nonsense guidance exactly
  // when it matters most: it reads as though 0 were a usable budget. Give an
  // explicit verdict instead of leaving the reader to do that arithmetic
  // themselves at the worst possible moment.
  if (best === 0) {
    console.log(
      'Every probed length was rejected, including the smallest (512). ' +
        `No real log will fit a link button -- even the smallest fixture needs about ${REALISTIC_MINIMUM} URL characters. ` +
        'The feature cannot be enabled as designed until this is understood differently.',
    );
  } else if (best < REALISTIC_MINIMUM) {
    console.log(
      `That is below the ~${REALISTIC_MINIMUM} characters even the smallest real log needs. ` +
        'No real log will fit a link button as designed; the feature cannot be enabled this way.',
    );
  } else {
    console.log(`Set MAX_LINK_CHARS in apps/bot/src/link.ts below ${best}, leaving a safety margin.`);
  }
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
