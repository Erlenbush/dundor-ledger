/**
 * Per-user rate limit for `!ledger pull`.
 *
 * `pull` is the one command that makes this bot speak into another bot's
 * command handler, so an unthrottled user could turn this into a spam relay
 * pointed at Dundor. The limit is per user rather than global so one impatient
 * person cannot lock out the channel.
 *
 * Time is passed in rather than read from the clock, so the behaviour is
 * testable without faking timers.
 */

export interface CooldownDecision {
  allowed: boolean;
  /** Milliseconds until this user may try again. Zero when allowed. */
  retryAfterMs: number;
  /**
   * True only for the first rejection in a window. Answering every blocked
   * attempt would turn one person's spam into two people's spam.
   */
  notify: boolean;
}

/** Sweep expired entries once the map gets big, so it cannot grow forever. */
const SWEEP_THRESHOLD = 1_000;

export class Cooldown {
  private readonly windowMs: number;
  private readonly seen = new Map<string, { usedAt: number; warned: boolean }>();

  constructor(windowMs: number) {
    this.windowMs = Math.max(0, windowMs);
  }

  get size(): number {
    return this.seen.size;
  }

  check(userId: string, now: number): CooldownDecision {
    const prev = this.seen.get(userId);
    const elapsed = prev === undefined ? Infinity : now - prev.usedAt;

    if (elapsed >= this.windowMs) {
      this.seen.set(userId, { usedAt: now, warned: false });
      this.sweep(now);
      return { allowed: true, retryAfterMs: 0, notify: false };
    }

    // Deliberately does not refresh usedAt: the window runs from the last
    // allowed use, so hammering the command cannot extend your own lockout.
    const notify = !prev!.warned;
    prev!.warned = true;
    return { allowed: false, retryAfterMs: this.windowMs - elapsed, notify };
  }

  private sweep(now: number): void {
    if (this.seen.size < SWEEP_THRESHOLD) return;
    for (const [id, entry] of this.seen) {
      if (now - entry.usedAt >= this.windowMs) this.seen.delete(id);
    }
  }
}
