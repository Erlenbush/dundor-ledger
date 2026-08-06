/**
 * Deterministic incompressible filler for tests that need an over-budget log.
 *
 * Shared because both `link.test.ts` and `reply.test.ts` need it and the trap
 * below is easy to fall into twice.
 *
 * `'x'.repeat(n)` will not do: 150,000 of one character gzips to 243
 * characters, so an "over budget" case built that way is comfortably under
 * budget and the test silently proves the opposite of what it claims.
 *
 * `Math.imul` keeps the multiply in 32 bits. A plain `seed * 1103515245`
 * exceeds JavaScript's safe integer range, loses precision and collapses into
 * a short cycle, which compresses well and reintroduces the same bug quietly.
 *
 * Real logs no longer serve this purpose: brotli brings even the 44-turn
 * Fungus fixture inside the budget, so only synthetic noise is reliably
 * too large.
 */
export const noise = (length: number): string => {
  let seed = 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    seed = Math.imul(seed, 48271) % 2147483647;
    out += String.fromCharCode(33 + (seed % 94));
  }
  return out;
};
