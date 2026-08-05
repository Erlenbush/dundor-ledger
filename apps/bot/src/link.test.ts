import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodeLog, logUrl, MAX_LINK_CHARS, SCHEME } from './link.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const decode = (encoded: string): string =>
  gunzipSync(Buffer.from(encoded.slice(SCHEME.length + 1), 'base64url')).toString('utf8');

/**
 * Deterministic incompressible filler.
 *
 * `'x'.repeat(n)` will not do: 150,000 of one character gzips to 243
 * characters, so an "over budget" case built that way is comfortably under
 * budget and the test silently proves the opposite of what it claims.
 *
 * `Math.imul` keeps the multiply in 32 bits. A plain `seed * 1103515245`
 * exceeds JavaScript's safe integer range, loses precision and collapses into
 * a short cycle, which compresses well and reintroduces the same bug quietly.
 */
const noise = (length: number): string => {
  let seed = 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    seed = Math.imul(seed, 48271) % 2147483647;
    out += String.fromCharCode(33 + (seed % 94));
  }
  return out;
};

describe('encodeLog', () => {
  it('round-trips a real log through gzip', () => {
    const log = fixture('snake-xl100.txt');
    expect(decode(encodeLog(log))).toBe(log);
  });

  it('tags the payload with the scheme so the format can change later', () => {
    expect(encodeLog('anything')).toMatch(/^g1\./);
  });

  it('produces only characters that are safe in a URL fragment', () => {
    const encoded = encodeLog(fixture('fungus-creature-loss-xl63.txt'));
    expect(encoded.slice(SCHEME.length + 1)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses hard enough to be worth doing', () => {
    const log = fixture('fungus-creature-loss-xl63.txt');
    expect(encodeLog(log).length).toBeLessThan(log.length / 5);
  });
});

describe('logUrl', () => {
  it('builds a fragment link for a log that fits', () => {
    const out = logUrl('https://example.com', fixture('snake-xl100.txt'));
    expect(out.full).toBe(true);
    expect(out.url).toContain('/#log=g1.');
  });

  it('falls back to the bare site when the log is too big', () => {
    const out = logUrl('https://example.com', noise(MAX_LINK_CHARS * 4));
    expect(out.full).toBe(false);
    expect(out.url).toBe('https://example.com');
  });

  it('never exceeds the budget', () => {
    const out = logUrl('https://example.com', fixture('fungus-creature-loss-xl63.txt'));
    expect(out.url.length).toBeLessThanOrEqual(MAX_LINK_CHARS);
  });

  it('tolerates a trailing slash on the base', () => {
    expect(logUrl('https://example.com/', 'x').url).toContain('https://example.com/#log=');
  });
});

describe('link contract', () => {
  const contract = JSON.parse(fixture('link-contract.json')) as {
    scheme: string;
    source: string;
    encoded: string;
  };

  it('still decodes to the log it was generated from', () => {
    // The web app asserts the same thing from its own decoder. If either side
    // changes the format, one of the two tests fails.
    expect(decode(contract.encoded)).toBe(fixture(contract.source));
  });

  it('uses the scheme this encoder writes', () => {
    expect(contract.scheme).toBe(SCHEME);
  });
});
