import { describe, expect, it } from 'vitest';
import { Cooldown } from './cooldown.js';

const WINDOW = 30_000;

describe('Cooldown', () => {
  it('allows the first use', () => {
    const cd = new Cooldown(WINDOW);
    expect(cd.check('user-a', 0).allowed).toBe(true);
  });

  it('blocks a second use inside the window', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    const second = cd.check('user-a', 1_000);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBe(29_000);
  });

  it('warns once per window so spam is not answered with spam', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    expect(cd.check('user-a', 1_000).notify).toBe(true);
    expect(cd.check('user-a', 2_000).notify).toBe(false);
    expect(cd.check('user-a', 3_000).notify).toBe(false);
  });

  it('allows again once the window has fully elapsed', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    expect(cd.check('user-a', WINDOW - 1).allowed).toBe(false);
    expect(cd.check('user-a', WINDOW).allowed).toBe(true);
  });

  it('re-arms the warning after the window resets', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    cd.check('user-a', 1_000);
    cd.check('user-a', 2_000);
    cd.check('user-a', WINDOW);
    expect(cd.check('user-a', WINDOW + 1).notify).toBe(true);
  });

  it('measures the window from the last allowed use, not the last attempt', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    // A blocked attempt must not push the window out, or a spammer would
    // lock themselves out forever.
    cd.check('user-a', 20_000);
    expect(cd.check('user-a', WINDOW).allowed).toBe(true);
  });

  it('tracks users independently', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    expect(cd.check('user-b', 0).allowed).toBe(true);
    expect(cd.check('user-a', 100).allowed).toBe(false);
  });

  it('rounds retryAfterMs down to zero at the boundary', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    expect(cd.check('user-a', WINDOW - 1).retryAfterMs).toBe(1);
  });

  it('does not grow without bound as users come and go', () => {
    const cd = new Cooldown(WINDOW);
    for (let i = 0; i < 5_000; i++) {
      cd.check(`user-${i}`, i);
    }
    // Every entry above is long expired by this point, so the map should have
    // been swept rather than retaining 5000 ids forever.
    cd.check('late-user', 10_000_000);
    expect(cd.size).toBeLessThan(5_000);
  });

  it('keeps entries that are still within their window', () => {
    const cd = new Cooldown(WINDOW);
    cd.check('user-a', 0);
    cd.check('user-b', 0);
    expect(cd.check('user-a', 1_000).allowed).toBe(false);
    expect(cd.check('user-b', 1_000).allowed).toBe(false);
  });

  it('treats a zero window as no rate limiting', () => {
    const cd = new Cooldown(0);
    expect(cd.check('user-a', 0).allowed).toBe(true);
    expect(cd.check('user-a', 0).allowed).toBe(true);
  });
});
