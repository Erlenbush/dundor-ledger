import { DiscordAPIError } from 'discord.js';
import type { ExportedFight } from '@dundor/parser';
import { formatFight } from './format.js';
import { logUrl } from './link.js';
import { problemReport, type LogProblem } from './problems.js';

/**
 * Builds the message the bot posts for a set of parsed fights.
 *
 * Separate from index.ts so the button, the notes and the fallbacks are unit
 * testable. Left inline, the only way to check any of it would be to post to
 * Discord.
 */

/** Several fights in one reply is a wall of text; three is the readable limit. */
const MAX_EMBEDS = 3;

export interface ReplyOptions {
  fights: ExportedFight[];
  problems: LogProblem[];
  /** The single source text to link, or null when there is not exactly one. */
  logText: string | null;
  /** Base URL of the web UI, or null when unset, which means no button. */
  webUrl: string | null;
}

export interface ReplyDraft {
  embeds: unknown[];
  content?: string;
  components?: unknown[];
  allowedMentions: { repliedUser: false };
}

export function buildReply({ fights, problems, logText, webUrl }: ReplyOptions): ReplyDraft {
  const shown = fights.slice(0, MAX_EMBEDS);
  const skipped = fights.length - shown.length;
  const detailed = fights.length === 1;

  const link = webUrl && logText != null ? logUrl(webUrl, logText) : null;

  const notes: string[] = [];
  if (!detailed) {
    const summary = skipped > 0
      ? `Showing ${shown.length} of ${fights.length} fights.`
      : `${fights.length} fights.`;
    // Say "the site", never "the button": sendReply can drop the button on a
    // rejected payload after this content is already built, and a link that
    // is over budget points at the bare site with no fight attached either
    // way. Either way "the site" stays true; "the button" would not.
    //
    // When a link exists but is over budget (`link && !link.full`), skip this
    // note entirely rather than say anything here: the over-budget note below
    // already covers it, and "upload one on its own" would be nonsense advice
    // when a single upload is exactly what produced this multi-fight reply.
    if (link?.full) {
      notes.push(`${summary} Open the site to see all ${fights.length}.`);
    } else if (!link) {
      notes.push(`${summary} Upload one on its own for the full breakdown.`);
    }
  }
  if (link && !link.full) {
    notes.push('This fight was too long to link directly. Open the site and drop the .txt on it.');
  }
  const report = problemReport(problems, true);
  if (report) notes.push(report);

  const content = notes.join('\n\n');

  // A markdown link in the description, not a link button.
  //
  // Buttons were the obvious choice — they are what the playerbase already
  // uses, and a component does not consume the embed's 6,000 character budget
  // the way a link in the description does. Measuring Discord killed it: a
  // button's `url` is capped at 512 characters ("Must be 512 or fewer in
  // length"), and the smallest real log needs about 1,545. The property that
  // looked like the advantage was the constraint. A description accepts at
  // least 4,000, so that is where the link goes; MAX_LINK_CHARS is set below
  // the measured ceiling with room for this text.
  //
  // Only the first embed carries the link: it belongs to the upload, not to
  // each fight, and repeating a multi-kilobyte URL per embed would blow the
  // 6,000 character total.
  const linkLine = link ? `\n\n[${link.full ? 'Open full breakdown' : 'Open the analyzer'}](${link.url})` : '';

  return {
    embeds: shown.map((f, i) => {
      const e = formatFight(f, detailed);
      return {
        title: e.title,
        description: i === 0 ? `${e.description}${linkLine}` : e.description,
        color: e.color,
        fields: e.fields,
        footer: { text: e.footer },
      };
    }),
    ...(content ? { content } : {}),
    allowedMentions: { repliedUser: false },
  };
}

/**
 * Post the draft, dropping components and retrying once if Discord rejects
 * the payload itself.
 *
 * Discord does not document a maximum length for a link button URL, so a badly
 * chosen budget must cost the button rather than the whole reply — but only
 * when the button is actually what Discord objected to. `reply()` can also
 * reject with a 403 (missing permission), a 5xx, or a network error after
 * Discord already created the message and the response was merely lost. None
 * of those are fixed by resending without the button: a permissions retry is
 * futile, and if the message already exists, `reply()` again is not
 * idempotent and double-posts. Only an HTTP 400 ("Invalid Form Body", the
 * shape Discord uses to reject a malformed or oversized component) means the
 * payload itself was the problem, so only that status triggers the retry.
 */
export async function sendReply(
  // Method shorthand (not a property typed as an arrow function) so this
  // structurally accepts discord.js's Message, whose own `reply` overloads
  // take a narrower options type than `unknown`. TypeScript only allows that
  // narrowing (bivariantly) for method-shaped signatures.
  target: { reply(options: unknown): Promise<unknown> },
  draft: ReplyDraft,
): Promise<void> {
  try {
    await target.reply(draft);
  } catch (err) {
    if (!draft.components) throw err;
    if (!(err instanceof DiscordAPIError) || err.status !== 400) throw err;
    // Message only, never the raw error: discord.js's DiscordAPIError carries
    // an own `requestBody` property with the rejected payload, which for this
    // call is the button that embeds the log. Logging the error object would
    // put log content in server logs, which is exactly what we promise never
    // to do — do not "fix" this back to the full object.
    console.error(
      'reply with components was rejected (400 Invalid Form Body), retrying without:',
      err.message,
    );
    const { components: _dropped, ...rest } = draft;
    await target.reply(rest);
  }
}
