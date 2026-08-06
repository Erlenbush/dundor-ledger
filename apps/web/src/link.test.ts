import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { canDecode, decodeLog, readFragment, type BrotliDecompress } from './link.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const contract = JSON.parse(fixture('link-contract.json')) as Record<
  'gzip' | 'brotli',
  { scheme: string; source: string; encoded: string; fragment: string }
>;

/**
 * Node's own brotli, standing in for the WebAssembly decoder.
 *
 * The production decoder is fetched lazily through a browser-only path that
 * cannot run under vitest, so it is injected. This still exercises the real
 * bytes the bot produced: only the decompressor differs, not the payload.
 */
const nodeBrotli: BrotliDecompress = async (input) =>
  new Uint8Array(brotliDecompressSync(Buffer.from(input)));

describe('readFragment', () => {
  it('reports nothing for an empty hash', () => {
    expect(readFragment('')).toEqual({ kind: 'none' });
    expect(readFragment('#')).toEqual({ kind: 'none' });
  });

  it('ignores a hash that is not ours', () => {
    expect(readFragment('#section-3')).toEqual({ kind: 'none' });
  });

  it('reads a gzip link', () => {
    const out = readFragment(contract.gzip.fragment);
    expect(out).toMatchObject({ kind: 'data', scheme: 'g1' });
  });

  it('reads a brotli link', () => {
    const out = readFragment(contract.brotli.fragment);
    expect(out).toMatchObject({ kind: 'data', scheme: 'b1' });
  });

  it('flags a scheme it does not understand rather than guessing', () => {
    expect(readFragment('#log=g9.AAAA')).toEqual({ kind: 'unknown-scheme' });
    expect(readFragment('#log=zz.AAAA')).toEqual({ kind: 'unknown-scheme' });
  });

  it('treats a payload truncated at the dot as data, not as absent', () => {
    // `{kind:'none'}` here would silently render the sample fight instead of
    // reporting a damaged link.
    expect(readFragment('#log=g1.')).toMatchObject({ kind: 'data', encoded: '' });
  });
});

describe('decodeLog', () => {
  it('recovers the exact log the bot gzipped', async () => {
    const frag = readFragment(contract.gzip.fragment);
    if (frag.kind !== 'data') throw new Error('contract fixture did not parse');
    expect(await decodeLog(frag)).toBe(fixture(contract.gzip.source));
  });

  it('recovers the exact log the bot brotli-compressed', async () => {
    const frag = readFragment(contract.brotli.fragment);
    if (frag.kind !== 'data') throw new Error('contract fixture did not parse');
    expect(await decodeLog(frag, nodeBrotli)).toBe(fixture(contract.brotli.source));
  });

  it('only loads the brotli decoder for a brotli link', async () => {
    // The decoder is ~204 KB of WebAssembly. A gzip link must never fetch it.
    const spy = vi.fn(nodeBrotli);
    const frag = readFragment(contract.gzip.fragment);
    if (frag.kind !== 'data') throw new Error('expected data');
    await decodeLog(frag, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a truncated gzip payload rather than returning nonsense', async () => {
    const frag = readFragment(`${contract.gzip.fragment.slice(0, 200)}`);
    if (frag.kind !== 'data') throw new Error('expected data');
    await expect(decodeLog(frag)).rejects.toThrow();
  });

  it('rejects a truncated brotli payload', async () => {
    const frag = readFragment(`${contract.brotli.fragment.slice(0, 200)}`);
    if (frag.kind !== 'data') throw new Error('expected data');
    await expect(decodeLog(frag, nodeBrotli)).rejects.toThrow();
  });

  it('rejects data that is not compressed at all', async () => {
    await expect(decodeLog({ scheme: 'g1', encoded: 'bm90IGd6aXA' })).rejects.toThrow();
    await expect(decodeLog({ scheme: 'b1', encoded: 'bm90IGd6aXA' }, nodeBrotli)).rejects.toThrow();
  });

  it('rejects an empty brotli result rather than yielding an empty log', async () => {
    const empty: BrotliDecompress = async () => new Uint8Array(0);
    await expect(decodeLog({ scheme: 'b1', encoded: 'AAAA' }, empty)).rejects.toThrow();
  });
});

describe('canDecode', () => {
  it('is true where DecompressionStream exists', () => {
    expect(canDecode()).toBe(true);
  });
});
