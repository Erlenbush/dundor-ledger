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
 * Longest URL to put on a link button.
 *
 * Discord does not document a ceiling and discord.js does not enforce one, so
 * this stays conservative until scripts/probe-button-url.mjs measures the real
 * limit. Every fixture except the 44-turn Fungus log encodes under 3,000.
 */
export const MAX_LINK_CHARS = 3_000;

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
