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
});

describe('decodeLog', () => {
  it('recovers the exact log the bot encoded', async () => {
    // The other half of the contract: the bot asserts this same string still
    // decodes from its side. Either encoder or decoder drifting fails a test.
    const frag = readFragment(`#log=${contract.encoded}`);
    if (frag.kind !== 'data') throw new Error('contract fixture did not parse');
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
});

describe('canDecode', () => {
  it('is true where DecompressionStream exists', () => {
    expect(canDecode()).toBe(true);
  });
});
