import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  encodeLog,
  encodeLogBrotli,
  logUrl,
  MAX_LINK_CHARS,
  SCHEME_BROTLI,
  SCHEME_GZIP,
} from './link.js';
import { noise } from './noise.test-util.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

/** Strip the `g1.`/`b1.` tag and decompress with the matching codec. */
const decode = (encoded: string): string => {
  const [tag, payload] = [encoded.slice(0, 2), encoded.slice(3)];
  const raw = Buffer.from(payload, 'base64url');
  return (tag === SCHEME_BROTLI ? brotliDecompressSync(raw) : gunzipSync(raw)).toString('utf8');
};


describe('encodeLog (gzip)', () => {
  it('round-trips a real log', () => {
    const log = fixture('snake-xl100.txt');
    expect(decode(encodeLog(log))).toBe(log);
  });

  it('tags the payload so the format can change later', () => {
    expect(encodeLog('anything')).toMatch(/^g1\./);
  });

  it('produces only characters safe in a URL fragment', () => {
    expect(encodeLog(fixture('fungus-creature-loss-xl63.txt')).slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('encodeLogBrotli', () => {
  it('round-trips a real log', () => {
    const log = fixture('fungus-creature-loss-xl63.txt');
    expect(decode(encodeLogBrotli(log))).toBe(log);
  });

  it('tags itself distinctly from gzip', () => {
    expect(encodeLogBrotli('anything')).toMatch(/^b1\./);
  });

  it('is meaningfully smaller than gzip on a real log', () => {
    // About 25% on these logs, which is the whole reason it exists: it is the
    // difference between the 44-turn Fungus fight linking and falling back.
    const log = fixture('fungus-creature-loss-xl63.txt');
    expect(encodeLogBrotli(log).length).toBeLessThan(encodeLog(log).length * 0.85);
  });

  it('produces only characters safe in a URL fragment', () => {
    expect(encodeLogBrotli(fixture('snake-xl100.txt')).slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('logUrl', () => {
  it('prefers gzip when it fits, so the reader needs no decoder', () => {
    const out = logUrl('https://example.com', fixture('snake-xl100.txt'));
    expect(out.full).toBe(true);
    expect(out.scheme).toBe(SCHEME_GZIP);
    expect(out.url).toContain('/#log=g1.');
  });

  it('reaches for brotli only when gzip does not fit', () => {
    // Fungus is 39,109 raw: about 4,680 URL characters gzipped, over budget,
    // and about 3,514 with brotli, under it.
    const out = logUrl('https://example.com', fixture('fungus-creature-loss-xl63.txt'));
    expect(out.full).toBe(true);
    expect(out.scheme).toBe(SCHEME_BROTLI);
    expect(out.url).toContain('/#log=b1.');
  });

  it('falls back to the bare site when neither encoding fits', () => {
    const out = logUrl('https://example.com', noise(MAX_LINK_CHARS * 4));
    expect(out.full).toBe(false);
    expect(out.scheme).toBeNull();
    expect(out.url).toBe('https://example.com');
  });

  it('never exceeds the budget on any fixture', () => {
    for (const f of [
      'snake-xl100.txt',
      'icecorn-xl63.txt',
      'ghoul-loss-xl100.txt',
      'two-fights-one-paste.txt',
      'fungus-creature-loss-xl63.txt',
    ]) {
      expect(logUrl('https://example.com', fixture(f)).url.length).toBeLessThanOrEqual(
        MAX_LINK_CHARS,
      );
    }
  });

  it('links every fixture at a production-length origin', () => {
    // Tests used to run against a 13-character origin while production is 41,
    // which hid how little headroom the largest fixtures actually have.
    const base = 'https://dundor-ledger.nuclidelabs.com';
    for (const f of [
      'snake-xl100.txt',
      'two-fights-one-paste.txt',
      'fungus-creature-loss-xl63.txt',
    ]) {
      const out = logUrl(base, fixture(f));
      expect(out.full, `${f} should link at a production origin`).toBe(true);
    }
  });

  it('tolerates a trailing slash on the base', () => {
    expect(logUrl('https://example.com/', 'x').url).toContain('https://example.com/#log=');
  });
});

describe('link contract', () => {
  const contract = JSON.parse(fixture('link-contract.json')) as Record<
    'gzip' | 'brotli',
    { scheme: string; source: string; encoded: string; fragment: string }
  >;

  it('still decodes the gzip sample it was generated from', () => {
    // The web app asserts the same thing from its own decoder. If either side
    // changes the format, one of the two tests fails.
    expect(decode(contract.gzip.encoded)).toBe(fixture(contract.gzip.source));
    expect(contract.gzip.scheme).toBe(SCHEME_GZIP);
  });

  it('still decodes the brotli sample it was generated from', () => {
    expect(decode(contract.brotli.encoded)).toBe(fixture(contract.brotli.source));
    expect(contract.brotli.scheme).toBe(SCHEME_BROTLI);
  });

  it('pins the fragment shape, not just the payload', () => {
    // `encoded` alone would let a rename of `log=` pass on both sides while
    // breaking every link already posted to Discord.
    for (const c of [contract.gzip, contract.brotli]) {
      expect(logUrl('https://x.dev', fixture(c.source)).url.endsWith(c.fragment)).toBe(true);
    }
  });
});
