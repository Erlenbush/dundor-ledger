import { PIP_PCT, RES_KEYS } from './constants.js';
import { attackCost } from './analyze.js';
import type { Analysis, Fight, Insight } from './types.js';

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;
const one = (n: number): string => String(Math.round(n * 10) / 10);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

const stat = (f: Fight, who: string, key: string): string | undefined =>
  f.entities[who]?.stats[key];

const resistPips = (f: Fight, who: string, key: string): number => {
  const v = Number(stat(f, who, key));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Derive the findings worth surfacing, most actionable first. Every number is
 * computed from the log; nothing is hardcoded. Body text uses **bold** and
 * *italic* markers so this stays renderer-agnostic.
 */
export function deriveInsights(fight: Fight, a: Analysis): Insight[] {
  const out: Insight[] = [];
  const { player: P, monster: M } = a;
  const mine = a.stats[P]!;
  const theirs = a.stats[M]!;

  // ── Element matchup ───────────────────────────────────────────────────────
  // The highest-leverage finding available, and invisible in the fight summary.
  const vulns = RES_KEYS.filter(([k]) => resistPips(fight, M, k) < 0);
  if (vulns.length) {
    const [vkey, vname] = vulns[0]!;
    const vPct = Math.abs(resistPips(fight, M, vkey)) * PIP_PCT;
    const heavy = RES_KEYS.filter(([k]) => resistPips(fight, M, k) >= 3).map(([, n]) => n);
    const secondary = Object.entries(mine.rawByType)
      .filter(([t]) => t !== 'physical')
      .sort((x, y) => y[1] - x[1])[0];

    let quant = '';
    if (secondary) {
      const [sname, sraw] = secondary;
      const lost = mine.resistLossByType[sname] ?? 0;
      const gain = Math.round((sraw * vPct) / 100);
      quant = ` Your ${sname} rolled **${sraw}** raw here and lost **${lost}** to resistance. ` +
        `The same rolls as ${vname} would have *gained* about **${gain}** instead — a swing of ` +
        `roughly **${lost + gain}** damage, for free.`;
    }

    out.push({
      id: 'matchup',
      severity: 'critical',
      tag: 'Matchup',
      headline: `${M} is vulnerable to ${vname} — and you brought none.`,
      body: `Its block lists **${vkey} ${stat(fight, M, vkey)}**, so ${vname} lands about ` +
        `**${Math.round(vPct)}% harder**` +
        (heavy.length ? `, while it shrugs off ${heavy.join(' and ')}` : '') + `.${quant} ` +
        `Nothing in the fight summary would ever tell you this exists.`,
    });
  }

  // ── Accuracy ──────────────────────────────────────────────────────────────
  // Only worth raising when misses actually cost turns.
  if (a.playerHitRate != null && mine.attacks >= 3 && a.playerHitRate <= 60) {
    const ev = stat(fight, M, 'Ev');
    const acc = stat(fight, P, 'Melee Accuracy');
    out.push({
      id: 'accuracy',
      severity: 'warning',
      tag: 'Accuracy',
      headline: `You landed ${mine.hits} of ${plural(mine.attacks, 'swing')}.`,
      body: `Melee accuracy **${acc}** against evasion **${ev}** left you missing ` +
        `**${pct(100 - a.playerHitRate)}** of the time. Every miss is a full turn of nothing. ` +
        `With damage this far ahead of the target's health pool, accuracy — not power — is what ` +
        `shortens these fights.`,
    });
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────
  const approachShare = (a.approachTurns / Math.max(1, a.totalTurns)) * 100;
  if (a.approachTurns > 0 && approachShare >= 30) {
    out.push({
      id: 'tempo',
      severity: 'note',
      tag: 'Tempo',
      headline: `${pct(approachShare)} of this fight was positioning.`,
      body: `You spotted it at **${fight.startDistance} tiles** and burned ` +
        `**${plural(a.approachTurns, 'turn')}** getting into range — contact on turn ` +
        `**${a.closedAt}**, first swing on turn **${a.firstAttackTurn}**. Nothing was at stake in ` +
        `that stretch; it is pure clock. Spawn distance, not the monster, set the length of this fight.`,
    });
  }

  // ── Defense ───────────────────────────────────────────────────────────────
  const mit = a.playerMitigation;
  if (mit.pct >= 75 && mit.incomingRaw > 0) {
    const band = fight.entities[M]?.damages[0];
    out.push({
      id: 'defense',
      severity: 'good',
      tag: 'Defense',
      headline: 'Your armour made this a non-fight.',
      body: `It connected on ${a.monsterHitRate != null ? pct(a.monsterHitRate) : 'most'} of its ` +
        `swings and still could not hurt you. **${mit.incomingRaw} damage** was rolled at you across ` +
        `${plural(theirs.attacks, 'attack')}; you took **${mit.taken}** — **${pct(mit.pct)}** absorbed. ` +
        `AC **${stat(fight, P, 'Ac')}** against ${band ? `${band.min}–${band.max}` : 'its small'} hits ` +
        `means every blow bottoms out at the **1 damage floor**` +
        (mit.flooredHits ? `, which is exactly what happened all ${mit.flooredHits} times` : '') +
        `. Note the log claims **${mit.acStated}** reduced, but only **${mit.absorbed}** was ever ` +
        `there to reduce — a huge AC roll against a small hit still only absorbs that hit.`,
    });
  }

  // ── Attack speed ──────────────────────────────────────────────────────────
  const stalls = a.stalled[P] ?? [];
  const speed = attackCost(fight, P);
  if (stalls.length && speed != null && speed > 1) {
    const detail = stalls
      .filter((s) => s.short != null && s.short > 0)
      .slice(0, 3)
      .map((s) => `turn ${s.turn} (short ${one(s.short!)})`)
      .join(', ');
    out.push({
      id: 'attack-speed',
      severity: 'warning',
      tag: 'Attack speed',
      headline: `Attack speed ${speed} cost you ${plural(stalls.length, 'turn')}.`,
      body: `You regain 1.0 moves per turn but each swing costs **${speed}**, so you bank a ` +
        `fraction and periodically stall with nothing to spend it on${detail ? ` — ${detail}` : ''}. ` +
        `A weapon at 1.0 speed converts those dead turns into real attacks.`,
    });
  }

  // ── Overkill ──────────────────────────────────────────────────────────────
  if (a.overkill > 0 && a.overkillOn === M) {
    const band = fight.entities[P]?.damages[0];
    const share = (a.overkill / Math.max(1, mine.dealt)) * 100;
    out.push({
      id: 'overkill',
      severity: share >= 30 ? 'warning' : 'note',
      tag: 'Overkill',
      headline: `${a.overkill} damage spilled past the kill.`,
      body: `Your final blow left it at **${a.finalMonsterHp}/${fight.maxHp[M]}** — ` +
        `**${pct(share)}** of your output did nothing. ` +
        (band ? `Your minimum ${band.type} roll alone is **${band.min}** against a monster with ` +
          `${fight.maxHp[M]} HP. ` : '') +
        `Deeper dungeons, not bigger numbers, are the constraint now.`,
    });
  }

  // ── Coin flips ────────────────────────────────────────────────────────────
  const razor = [
    ...mine.nearHits.map((n) => ({ ...n, who: P, landed: true })),
    ...theirs.nearHits.map((n) => ({ ...n, who: M, landed: true })),
    ...mine.nearMisses.filter((n) => n.margin < 2).map((n) => ({ ...n, who: P, landed: false })),
    ...theirs.nearMisses.filter((n) => n.margin < 2).map((n) => ({ ...n, who: M, landed: false })),
  ].sort((x, y) => x.margin - y.margin)[0];
  if (razor) {
    out.push({
      id: 'coin-flip',
      severity: 'note',
      tag: 'Coin flip',
      headline: `Turn ${razor.turn} came down to ${razor.margin.toFixed(3)}.`,
      body: `${razor.who === P ? 'Your' : `The ${M}'s`} evade roll was ` +
        `**${razor.roll.toFixed(5)}** against a threshold of **${razor.threshold.toFixed(5)}** — it ` +
        `${razor.landed ? 'landed' : 'missed'} by **${razor.margin.toFixed(3)}**. Dundor rolls these ` +
        `to five decimals, so outcomes this tight are settled far below anything the summary shows.`,
    });
  }

  // ── Damage mix ────────────────────────────────────────────────────────────
  const types = Object.entries(mine.byType).sort((x, y) => y[1] - x[1]);
  if (types.length > 1) {
    const total = types.reduce((n, [, v]) => n + v, 0);
    const [sname, sval] = types[1]!;
    const lost = mine.resistLossByType[sname] ?? 0;
    out.push({
      id: 'damage-mix',
      severity: lost > 0 ? 'warning' : 'note',
      tag: 'Damage mix',
      headline: `${cap(sname)} carried ${pct((sval / total) * 100)} of your output.`,
      body: `Split was ${types.map(([t, v]) => `**${v}** ${t}`).join(' / ')}. ` +
        (lost > 0
          ? `Resistance shaved **${lost}** off your ${sname} before armour even applied.`
          : `Neither element was resisted, so the whole roll landed.`),
    });
  }

  return out;
}
