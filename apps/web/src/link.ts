/**
 * Reads a fight out of the URL fragment.
 *
 * The bot puts a compressed log after the `#`, which browsers never transmit,
 * so the log arrives here without having passed through any server. This is the
 * decode half of the contract pinned by fixtures/link-contract.json.
 */

/** gzip: every browser decompresses this natively. */
const SCHEME_GZIP = 'g1';
/** brotli: no browser decompresses this natively, so it costs a WASM decoder. */
const SCHEME_BROTLI = 'b1';

export type Scheme = typeof SCHEME_GZIP | typeof SCHEME_BROTLI;

export type Fragment =
  | { kind: 'none' }
  | { kind: 'unknown-scheme' }
  | { kind: 'data'; scheme: Scheme; encoded: string };

export function readFragment(hash: string): Fragment {
  const match = /^#?log=([^.]+)\.(.*)$/.exec(hash);
  if (!match) return { kind: 'none' };
  const tag = match[1];
  if (tag !== SCHEME_GZIP && tag !== SCHEME_BROTLI) return { kind: 'unknown-scheme' };
  return { kind: 'data', scheme: tag, encoded: match[2]! };
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

/** Decompressor for the brotli scheme. Injectable so tests need no WASM. */
export type BrotliDecompress = (input: Uint8Array) => Promise<Uint8Array>;

/**
 * Load the brotli decoder on demand.
 *
 * A dynamic import so the ~204 KB of WebAssembly is fetched only when someone
 * actually opens a `b1` link. Most fights fit gzip and never touch this, which
 * is the whole reason the bot prefers gzip.
 */
const loadBrotli: BrotliDecompress = async (input) => {
  const brotli = await (await import('brotli-dec-wasm')).default;
  return brotli.decompress(input);
};

/**
 * Recover the log text from a fragment. Throws on anything malformed.
 *
 * `brotliDecompress` exists so tests can supply Node's own brotli rather than
 * loading WebAssembly through a browser-only fetch path. Production callers
 * pass nothing and get the lazy WASM loader.
 */
export async function decodeLog(
  frag: { scheme: Scheme; encoded: string },
  brotliDecompress: BrotliDecompress = loadBrotli,
): Promise<string> {
  const raw = bytes(frag.encoded);

  if (frag.scheme === SCHEME_BROTLI) {
    const out = await brotliDecompress(raw);
    if (!out.length) throw new Error('brotli produced no output');
    return new TextDecoder().decode(out);
  }

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
