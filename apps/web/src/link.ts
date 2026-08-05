/**
 * Reads a fight out of the URL fragment.
 *
 * The bot puts a gzipped log after the `#`, which browsers never transmit, so
 * the log arrives here without having passed through any server. This is the
 * decode half of the contract pinned by fixtures/link-contract.json.
 */

const SCHEME = 'g1';

export type Fragment =
  | { kind: 'none' }
  | { kind: 'unknown-scheme' }
  | { kind: 'data'; encoded: string };

export function readFragment(hash: string): Fragment {
  const match = /^#?log=([^.]+)\.(.+)$/.exec(hash);
  if (!match) return { kind: 'none' };
  if (match[1] !== SCHEME) return { kind: 'unknown-scheme' };
  return { kind: 'data', encoded: match[2]! };
}

/** False on browsers without DecompressionStream, so the caller can say so. */
export function canDecode(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Throws on anything that is not a well formed payload. */
export async function decodeLog(encoded: string): Promise<string> {
  const stream = new Blob([bytes(encoded)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
