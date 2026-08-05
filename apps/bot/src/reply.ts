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
    const tail = link?.full
      ? `The button opens all ${fights.length}.`
      : 'Upload one on its own for the full breakdown.';
    notes.push(
      skipped > 0
        ? `Showing ${shown.length} of ${fights.length} fights. ${tail}`
        : `${fights.length} fights. ${tail}`,
    );
  }
  if (link && !link.full) {
    notes.push('This fight was too long to link directly. Open the site and drop the .txt on it.');
  }
  const report = problemReport(problems, true);
  if (report) notes.push(report);

  const content = notes.join('\n\n');

  return {
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
    ...(content ? { content } : {}),
    ...(link
      ? {
          components: [
            {
              type: 1,
              components: [{ type: 2, style: 5, label: 'Open full breakdown', url: link.url }],
            },
          ],
        }
      : {}),
    allowedMentions: { repliedUser: false },
  };
}

/**
 * Post the draft, dropping components and retrying once if Discord refuses it.
 *
 * Discord does not document a maximum length for a link button URL, so a badly
 * chosen budget must cost the button rather than the whole reply.
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
    console.error('reply with components was rejected, retrying without:', err);
    const { components: _dropped, ...rest } = draft;
    await target.reply(rest);
  }
}
