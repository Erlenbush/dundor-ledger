import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * Encodes a log into a link the browser UI can open.
 *
 * The payload rides in the URL fragment, which is never transmitted in an HTTP
 * request and is stripped from Referer headers. The log therefore reaches
 * neither Cloudflare nor any access log, which is what keeps this consistent
 * with never persisting logs.
 */

/**
 * Scheme tags, so the encoding can change without breaking links already posted.
 *
 * `g1` is gzip, which every browser decompresses natively through
 * `DecompressionStream`. `b1` is brotli, which none of them do — it costs the
 * reader a ~204 KB WebAssembly decoder, fetched only when a `b1` link is
 * actually opened. That is why gzip is tried first and brotli is a fallback
 * rather than the default: most fights fit gzip, and those readers should not
 * pay for a decoder they do not need.
 */
export const SCHEME_GZIP = 'g1';
export const SCHEME_BROTLI = 'b1';

/** @deprecated Prefer SCHEME_GZIP. Kept so older imports keep resolving. */
export const SCHEME = SCHEME_GZIP;

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
 * With gzip this covers raw logs to roughly 31,000 characters; with brotli,
 * roughly 44,000. The 44-turn Fungus fixture is 39,109 and needs brotli.
 */
export const MAX_LINK_CHARS = 3_700;

const b64 = (buf: Buffer): string => buf.toString('base64url');

/** gzip, decompressed natively by the browser. */
export function encodeLog(text: string): string {
  return `${SCHEME_GZIP}.${b64(gzipSync(text, { level: 9 }))}`;
}

/**
 * brotli, roughly 25% smaller than gzip on these logs.
 *
 * Quality 11 is the slowest setting and worth it here: this runs once per
 * reply on a log of a few tens of kilobytes, and every character saved is a
 * character of URL budget.
 */
export function encodeLogBrotli(text: string): string {
  const packed = brotliCompressSync(Buffer.from(text, 'utf8'), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  return `${SCHEME_BROTLI}.${b64(packed)}`;
}

export interface LogLink {
  url: string;
  /** False when the log did not fit either encoding, so the URL is the bare site. */
  full: boolean;
  /** Which encoding carried it, or null on the bare-site fallback. */
  scheme: typeof SCHEME_GZIP | typeof SCHEME_BROTLI | null;
}

/**
 * Build the link for a log, preferring the encoding that costs the reader least.
 *
 * gzip first because the browser already has it. Brotli only when gzip does not
 * fit, since it makes the reader download a decoder. Neither fitting means the
 * bare site, and the caller says so rather than pretending the fight is there.
 */
export function logUrl(base: string, text: string): LogLink {
  const site = base.replace(/\/+$/, '');

  const gz = `${site}/#log=${encodeLog(text)}`;
  if (gz.length <= MAX_LINK_CHARS) return { url: gz, full: true, scheme: SCHEME_GZIP };

  const br = `${site}/#log=${encodeLogBrotli(text)}`;
  if (br.length <= MAX_LINK_CHARS) return { url: br, full: true, scheme: SCHEME_BROTLI };

  return { url: site, full: false, scheme: null };
}
