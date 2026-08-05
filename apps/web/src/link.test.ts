import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canDecode, decodeLog, readFragment } from './link.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const contract = JSON.parse(fixture('link-contract.json')) as {
  scheme: string;
  source: string;
  encoded: string;
  fragment: string;
};

describe('readFragment', () => {
  it('reports nothing for an empty hash', () => {
    expect(readFragment('')).toEqual({ kind: 'none' });
    expect(readFragment('#')).toEqual({ kind: 'none' });
  });

  it('ignores a hash that is not ours', () => {
    expect(readFragment('#section-3')).toEqual({ kind: 'none' });
  });

  it('extracts the payload from a link this bot produced', () => {
    const out = readFragment(`#log=${contract.encoded}`);
    expect(out.kind).toBe('data');
  });

  it('flags a scheme it does not understand rather than guessing', () => {
    expect(readFragment('#log=g9.AAAA')).toEqual({ kind: 'unknown-scheme' });
  });

  it('reads the exact fragment shape the bot produces, pinned by the contract', () => {
    // The bot side pins the same contract.fragment against logUrl's output.
    // If either side changes the URL shape (not just the codec), one of the
    // two tests fails.
    const out = readFragment(contract.fragment);
    expect(out.kind).toBe('data');
    if (out.kind !== 'data') throw new Error('expected data');
    expect(out.encoded).toBe(contract.encoded.slice(contract.scheme.length + 1));
  });

  it('treats a link truncated right at the dot as our scheme with an empty payload, not as no link at all', () => {
    // `#log=g1.` with nothing after the final dot used to fail the regex
    // entirely and come back as `{ kind: 'none' }`, which App.tsx treats as
    // "no link on this page load" -- so a truncated link silently rendered
    // the sample fight instead of reporting damage. It must route to the
    // 'data' path (and therefore into decodeLog, which rejects it) instead.
    expect(readFragment('#log=g1.')).toEqual({ kind: 'data', encoded: '' });
  });
});

describe('decodeLog', () => {
  it('recovers the exact log the bot encoded', async () => {
    // The other half of the contract: the bot asserts this same string still
    // decodes from its side. Either encoder or decoder drifting fails a test.
    const frag = readFragment(`#log=${contract.encoded}`);
    if (frag.kind !== 'data') throw new Error('contract fixture did not parse');
    expect(await decodeLog(frag.encoded)).toBe(fixture(contract.source));
  });

  it('reads the full pinned fragment end to end, URL shape included', async () => {
    const frag = readFragment(contract.fragment);
    expect(frag.kind).toBe('data');
    if (frag.kind !== 'data') throw new Error('expected data');
    expect(await decodeLog(frag.encoded)).toBe(fixture(contract.source));
  });

  it('rejects a truncated payload rather than returning nonsense', async () => {
    const frag = readFragment(`#log=${contract.encoded.slice(0, 200)}`);
    if (frag.kind !== 'data') throw new Error('expected data');
    await expect(decodeLog(frag.encoded)).rejects.toThrow();
  });

  it('rejects data that is not gzip at all', async () => {
    await expect(decodeLog('bm90IGd6aXA')).rejects.toThrow();
  });

  it('rejects an empty payload rather than resolving to empty text', async () => {
    // The other half of the truncated-fragment fix: readFragment now hands
    // decodeLog an empty string for `#log=g1.` instead of never calling it.
    await expect(decodeLog('')).rejects.toThrow();
  });
});

describe('canDecode', () => {
  it('is true where DecompressionStream exists', () => {
    expect(canDecode()).toBe(true);
  });
});
