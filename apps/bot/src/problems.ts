/**
 * User-facing text for the ways reading a log can fail.
 *
 * Every failure used to be silent: a `.txt` that would not parse produced
 * exactly the same result as a bot that was offline, missing a permission, or
 * not in the channel. The only record was the journal on the server. Someone
 * who uploads a file is expecting an answer, so each failure gets one.
 *
 * Pure string building, so the wording is testable without Discord.
 */

/** Discord attachments are fetched over HTTP, so keep the ceiling modest. */
export const MAX_ATTACHMENT_BYTES = 2_000_000;

export type LogProblem =
  | { kind: 'oversized'; name: string; size: number }
  | { kind: 'download'; name: string; status: number }
  | { kind: 'unparsed'; name: string };

const mb = (bytes: number): string => `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;

const describe = (p: LogProblem): string => {
  switch (p.kind) {
    case 'oversized':
      return `\`${p.name}\` is ${mb(p.size)}, over my ${mb(MAX_ATTACHMENT_BYTES)} limit. Upload a single fight rather than a full history.`;
    case 'download':
      return `I could not download \`${p.name}\` from Discord (HTTP ${p.status}). Try uploading it again.`;
    case 'unparsed':
      return `\`${p.name}\` does not look like a Dundor battle log. It should be the .txt exactly as \`dun logs\` produces it, not a screenshot or an edited copy.`;
  }
};

/**
 * Build the reply for a set of problems, or null when there is nothing to say.
 *
 * `parsedSomething` softens the wording: if part of the upload worked, the
 * embeds carry the answer and this is only a footnote.
 */
export function problemReport(problems: LogProblem[], parsedSomething: boolean): string | null {
  if (!problems.length) return null;

  const lines = problems.map(describe);
  const body = lines.length === 1 ? lines[0]! : lines.map((l) => `- ${l}`).join('\n');

  return parsedSomething ? `Some of that upload did not read:\n${body}` : body;
}
