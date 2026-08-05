import { gzipSync } from 'node:zlib';

/**
 * Encodes a log into a link the browser UI can open.
 *
 * The payload rides in the URL fragment, which is never transmitted in an HTTP
 * request and is stripped from Referer headers. The log therefore reaches
 * neither Cloudflare nor any access log, which is what keeps this consistent
 * with never persisting logs.
 */

/** Scheme tag, so the encoding can change without breaking links already posted. */
export const SCHEME = 'g1';

/**
 * Longest URL to put in an embed description.
 *
 * Measured against the live API rather than guessed, because the guess was
 * wrong in a way that could not work:
 *
 *   link button `url`              512   <- kills carrying a log this way
 *   embed `url` (clickable title)  2048
 *   embed description             >4000
 *
 * The smallest real log needs about 1,545 characters at the production origin,
 * so a button was never viable regardless of budget. The description is, and
 * 3,700 leaves room for the fight summary lines and the markdown syntax that
 * share it (about 104 characters) inside the 4,096 description cap, and for
 * the insight fields inside the 6,000 whole-embed cap.
 *
 * This covers raw logs to roughly 31,000 characters. Longer fights — the
 * 44-turn Fungus fixture is 39,109 — fall back to the bare site. Brotli would
 * reach about 44,600 but is not in the browser's DecompressionStream, so it
 * needs a decoder in the bundle; the `g1` scheme tag exists so a `b1` can be
 * added later without breaking links already posted.
 */
export const MAX_LINK_CHARS = 3_700;

export function encodeLog(text: string): string {
  return `${SCHEME}.${gzipSync(text, { level: 9 }).toString('base64url')}`;
}

export interface LogLink {
  url: string;
  /** False when the log did not fit, so the URL points at the bare site. */
  full: boolean;
}

export function logUrl(base: string, text: string): LogLink {
  const site = base.replace(/\/+$/, '');
  const url = `${site}/#log=${encodeLog(text)}`;
  return url.length <= MAX_LINK_CHARS ? { url, full: true } : { url: site, full: false };
}
