import { PIP_PCT, RES_KEYS } from './constants.js';
import { attackCost } from './analyze.js';
import type { Analysis, Fight, Insight } from './types.js';

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;
const one = (n: number): string => String(Math.round(n * 10) / 10);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

const stat = (f: Fight, who: string, key: string): string | undefined =>
  f.entities[who]?.stats[key];

/**
 * Least damage a secondary element can contribute before its share is worth
 * reporting. A fight where one landed swing dealt 3 physical and 1 fire really
 * did put 25% of its output into fire, and saying so is arithmetic rather than
 * analysis. Real splits in the fixtures run 33 and up; the noise runs 1 and 2.
 */
const MIX_FLOOR = 10;

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
  // The most actionable finding, and one the fight summary never shows.
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
        `The same rolls as ${vname} would have *gained* about **${gain}** instead, a swing of ` +
        `roughly **${lost + gain}** damage, for free.`;
    }

    out.push({
      id: 'matchup',
      severity: 'critical',
      tag: 'Matchup',
      headline: `${M} is vulnerable to ${vname}, and you brought none.`,
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
        `With damage this far ahead of the target's health pool, accuracy rather than power ` +
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
        `**${plural(a.approachTurns, 'turn')}** getting into range. Contact came on turn ` +
        `**${a.closedAt}**, first swing on turn **${a.firstAttackTurn}**. Nothing was at stake in ` +
        `that stretch; it is pure clock. Spawn distance, not the monster, set the length of this fight.`,
    });
  }

  // ── Walked in wounded ─────────────────────────────────────────────────────
  // Dundor does not heal you between fights, so this is often the whole story.
  const playerDied = fight.outcome.loser === P;
  if (a.startHpPct != null && a.startHpPct < 60) {
    const start = fight.startHp[P];
    const max = fight.maxHp[P];
    const survivable = a.playerMitigation.taken < (max ?? 0);
    out.push({
      id: 'low-hp-start',
      severity: a.startHpPct < 25 ? 'critical' : 'warning',
      tag: 'Entry HP',
      headline: `You started this fight at ${pct(a.startHpPct)} health.`,
      body: `**${start}/${max} HP** at the opening bell. Dundor does not top you up between ` +
        `fights. You then took **${a.playerMitigation.taken}** damage over ${plural(a.totalTurns, 'turn')}` +
        (playerDied && survivable
          ? `, which killed you. At full health the same fight ends with you on ` +
            `**${(max ?? 0) - a.playerMitigation.taken}/${max}**. Nothing about the matchup beat ` +
            `you. The entry HP did, and resting first was the whole fight.`
          : `. Worth resting before the next one.`),
    });
  }

  // ── The blow that ended it ────────────────────────────────────────────────
  if (playerDied) {
    let fatal: { type: string; raw: number; dealt: number; resist?: number; ac?: number } | null = null;
    for (const t of fight.turns) {
      for (const b of t.beats) {
        if (b.t !== 'hit' || b.who === P) continue;
        for (const d of b.damages) {
          if ((d.hpAfter ?? 0) < 0) {
            fatal = { type: d.type, raw: d.raw, dealt: d.dealt ?? 0, resist: d.afterResist, ac: d.acCut };
          }
        }
      }
    }
    if (fatal) {
      const band = fight.entities[M]?.damages.find((d) => d.type === fatal!.type);
      out.push({
        id: 'killing-blow',
        severity: 'critical',
        tag: 'Killing blow',
        headline: `A ${fatal.raw}-point ${fatal.type} roll finished you.`,
        body: `It rolled **${fatal.raw}**` +
          (band ? ` from a ${band.min}–${band.max} band, near the top of its range` : '') +
          `. Your resistance took it to **${fatal.resist ?? fatal.raw}**, armour absorbed ` +
          `**${fatal.ac ?? 0}**, and **${fatal.dealt}** still landed. Every earlier hit had bottomed ` +
          `out at the damage floor; this one did not, because ${fatal.type} is where this monster ` +
          `actually threatens you, not its ${fight.entities[M]?.damages[0]?.type ?? 'melee'}.`,
      });
    }
  }

  // ── Defense ───────────────────────────────────────────────────────────────
  // Only claim the armour won when the player actually walked away.
  const mit = a.playerMitigation;
  if (mit.pct >= 75 && mit.incomingRaw > 0 && !playerDied) {
    // Cite the band that actually threatens, not whichever is listed first.
    const band = [...(fight.entities[M]?.damages ?? [])].sort((x, y) => y.max - x.max)[0];
    out.push({
      id: 'defense',
      severity: 'good',
      tag: 'Defense',
      headline: 'Your armour made this a non-fight.',
      body: `It connected on ${a.monsterHitRate != null ? pct(a.monsterHitRate) : 'most'} of its ` +
        `swings and still could not hurt you. **${mit.incomingRaw} damage** was rolled at you across ` +
        `${plural(theirs.attacks, 'attack')}; you took **${mit.taken}**, so **${pct(mit.pct)}** was absorbed. ` +
        `AC **${stat(fight, P, 'Ac')}** against ${band ? `${band.min}–${band.max}` : 'its small'} hits ` +
        `means every blow bottoms out at the **1 damage floor**` +
        (mit.flooredHits ? `, which is exactly what happened all ${mit.flooredHits} times` : '') +
        `. Note the log claims **${mit.acStated}** reduced, but only **${mit.absorbed}** was ever ` +
        `there to reduce. A huge AC roll against a small hit still only absorbs that hit.`,
    });
  }

  // ── Exposure ──────────────────────────────────────────────────────────────
  // The mirror of Defense, and the gap that let a fight lost to being hit every
  // single turn produce no insight naming the reason. Defense only ever fires
  // to congratulate a win, so a death by attrition through armour that never
  // helped was described in terms of dice and attack speed and nothing else.
  // Requires low mitigation: when armour did hold, the loss was about something
  // else and the accuracy or attack speed findings own it.
  if (
    playerDied &&
    mit.incomingRaw > 0 &&
    mit.pct < 75 &&
    theirs.attacks > 0 &&
    a.monsterHitRate != null &&
    a.monsterHitRate >= 50
  ) {
    const evade = Number(stat(fight, P, 'Melee Evade Chance'));
    const band = [...(fight.entities[M]?.damages ?? [])].sort((x, y) => y.max - x.max)[0];
    const dodges = Number.isFinite(evade) ? (theirs.attacks * evade) / 100 : null;
    out.push({
      id: 'exposure',
      severity: 'critical',
      tag: 'Evasion',
      headline: `${M} landed ${theirs.hits} of ${plural(theirs.attacks, 'swing')}.`,
      body:
        (dodges != null
          ? `Your evade chance was **${pct(evade)}**, so you were expected to dodge **${one(dodges)}** of them. `
          : '') +
        `**${mit.incomingRaw} damage** was rolled at you and **${mit.taken}** landed, so armour covered ` +
        `only **${pct(mit.pct)}**. AC **${stat(fight, P, 'Ac')}** subtracts a flat amount, and against ` +
        `${band ? `**${band.min}–${band.max}**` : 'hits'} rolls it cannot scale with the hit. Not being ` +
        `hit is the defence that does.`,
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
        `fraction and periodically stall with nothing to spend it on${detail ? `: ${detail}` : ''}. ` +
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
      body: `Your final blow left it at **${a.finalMonsterHp}/${fight.maxHp[M]}**, so ` +
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
        `**${razor.roll.toFixed(5)}** against a threshold of **${razor.threshold.toFixed(5)}**, so it ` +
        `${razor.landed ? 'landed' : 'missed'} by **${razor.margin.toFixed(3)}**. Dundor rolls these ` +
        `to five decimals, so outcomes this tight are settled far below anything the summary shows.`,
    });
  }

  // ── Dice ──────────────────────────────────────────────────────────────────
  // Both inputs to luck are printed in the log: damage bands give each roll a
  // position from 0 to 100, and evade thresholds give an exact expected hit
  // count. Report the dice only when they were notably one-sided.
  {
    const facts: string[] = [];
    let weight = 0;
    for (const [who, l] of [[P, a.luck[P]!], [M, a.luck[M]!]] as const) {
      const name = who === P ? 'You' : `The ${M}`;
      const accGap = l.hits - l.expectedHits;
      if (l.attacks >= 3 && Math.abs(accGap) >= 1.4) {
        facts.push(
          `${name} landed **${l.hits} of ${plural(l.attacks, 'swing')}** where a fair run ` +
          `produces **${l.expectedHits}**, so the accuracy dice ran ` +
          `${accGap > 0 ? 'hot' : 'cold'} by ${Math.abs(accGap).toFixed(1)} hits.`);
        weight += Math.abs(accGap);
      }
      if (l.avgPct != null && l.rolls.length >= 4 && Math.abs(l.avgPct - 50) >= 18) {
        facts.push(
          `${name === 'You' ? 'Your' : `${name}'s`} damage rolls averaged the ` +
          `**${ordinal(Math.round(l.avgPct))} percentile** of their bands.`);
        weight += Math.abs(l.avgPct - 50) / 20;
      }
      const extreme = l.rolls.filter((r) => r.pct >= 98)[0];
      if (extreme) {
        facts.push(
          `${name === 'You' ? 'Your' : `${name}'s`} turn-${extreme.turn} ${extreme.type} roll of ` +
          `**${extreme.raw}** was the very top of its ${extreme.min}-${extreme.max} band.`);
        weight += 1;
      }
    }
    if (facts.length && weight >= 1.4) {
      out.push({
        id: 'dice',
        severity: 'note',
        tag: 'Dice',
        headline: 'The dice had opinions about this fight.',
        body: facts.join(' ') +
          ' None of this is visible in the summary, and none of it is something you can fix.',
      });
    }
  }

  // ── Damage mix ────────────────────────────────────────────────────────────
  const types = Object.entries(mine.byType).sort((x, y) => y[1] - x[1]);
  if (types.length > 1 && (types[1]?.[1] ?? 0) >= MIX_FLOOR) {
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
