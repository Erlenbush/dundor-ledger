import { DAMAGE_FLOOR, MOVES_PER_TURN } from './constants.js';
import type {
  Analysis, BandedRoll, CombatantStats, DamageInstance, Fight, HpPoint, Luck,
  Mitigation, StalledTurn, TurnDamage,
} from './types.js';

const emptyStats = (): CombatantStats => ({
  attacks: 0, hits: 0, misses: 0, rawRolled: 0, dealt: 0,
  acAbsorbedByFoe: 0, resistAbsorbedByFoe: 0, flooredHits: 0,
  byType: {}, rawByType: {}, resistLossByType: {}, nearMisses: [], nearHits: [],
});

/** A hit AC should have wiped out, saved only by the 1-point floor. */
export function isFloored(d: DamageInstance): boolean {
  if (d.acCut == null || d.dealt !== DAMAGE_FLOOR) return false;
  return (d.afterResist ?? d.raw) - d.acCut < DAMAGE_FLOOR;
}

/** Attack Speed, i.e. how many moves one swing costs. */
export function attackCost(fight: Fight, who: string): number | null {
  const v = Number.parseFloat(fight.entities[who]?.stats['Attack Speed'] ?? '');
  return Number.isFinite(v) ? v : null;
}

/** Reduce a parsed fight to the numbers worth reporting. Pure; no I/O. */
export function analyze(fight: Fight): Analysis {
  const player = fight.playerName;
  const monster = fight.monsterName;

  const stats: Record<string, CombatantStats> = {
    [player]: emptyStats(),
    [monster]: emptyStats(),
  };
  const stalled: Record<string, StalledTurn[]> = { [player]: [], [monster]: [] };
  const series: Record<string, HpPoint[]> = { [player]: [], [monster]: [] };

  // Seed from what each side walked in with. Seeding from the maximum draws a
  // phantom cliff on the first turn a wounded combatant reports its real HP.
  const hp: Record<string, number | null> = {
    [player]: fight.startHp[player] ?? fight.maxHp[player] ?? null,
    [monster]: fight.startHp[monster] ?? fight.maxHp[monster] ?? null,
  };

  series[player]!.push({ turn: 0, hp: hp[player]! });
  series[monster]!.push({ turn: 0, hp: hp[monster]! });

  const bandsOf = (who: string) =>
    new Map((fight.entities[who]?.damages ?? []).map((d) => [d.type, d]));
  const bands: Record<string, Map<string, { min: number; max: number }>> = {
    [player]: bandsOf(player),
    [monster]: bandsOf(monster),
  };
  const emptyLuck = (): Luck =>
    ({ rolls: [], avgPct: null, hot: 0, cold: 0, attacks: 0, hits: 0, expectedHits: 0 });
  const luck: Record<string, Luck> = { [player]: emptyLuck(), [monster]: emptyLuck() };
  const turnDamage: TurnDamage[] = [];

  const turnsSeen: number[] = [];
  let firstAttackTurn: number | null = null;
  let closedAt: number | null = null;
  let events = 0;

  for (const t of fight.turns) {
    if (t.n) turnsSeen.push(t.n);

    const gainedThisTurn: Array<{ who: string; movesLeft: number | null }> = [];
    const spentThisTurn = new Set<string>();
    const dealtThisTurn: Record<string, number> = { [player]: 0, [monster]: 0 };

    for (const b of t.beats) {
      events++;
      switch (b.t) {
        case 'gains':
          gainedThisTurn.push({ who: b.who, movesLeft: b.movesLeft });
          if (b.who in hp) hp[b.who] = b.hp;
          break;
        case 'uses':
          spentThisTurn.add(b.who);
          break;
        case 'move':
        case 'sneak':
          if (b.distance === 0 && closedAt === null) closedAt = t.n;
          break;
        case 'miss': {
          const s = stats[b.who];
          if (!s) break;
          s.attacks++;
          s.misses++;
          s.nearMisses.push({ turn: t.n, margin: b.threshold - b.roll, roll: b.roll, threshold: b.threshold });
          const lm = luck[b.who];
          if (lm) { lm.attacks++; lm.expectedHits += (100 - b.threshold) / 100; }
          firstAttackTurn ??= t.n;
          break;
        }
        case 'hit': {
          const s = stats[b.who];
          if (!s) break;
          s.attacks++;
          s.hits++;
          firstAttackTurn ??= t.n;
          // Landed by a hair. The mirror of a near miss, and just as telling.
          const margin = b.roll - b.threshold;
          if (margin < 2) s.nearHits.push({ turn: t.n, margin, roll: b.roll, threshold: b.threshold });

          const lk = luck[b.who];
          if (lk) { lk.attacks++; lk.hits++; lk.expectedHits += (100 - b.threshold) / 100; }

          for (const d of b.damages) {
            const dealt = d.dealt ?? 0;
            s.rawRolled += d.raw;
            s.dealt += dealt;
            if (d.acCut) s.acAbsorbedByFoe += d.acCut;

            let resistLoss = 0;
            if (d.afterResist != null && d.resistPct != null) {
              resistLoss = Math.max(0, d.raw - d.afterResist);
              s.resistAbsorbedByFoe += resistLoss;
            }
            if (isFloored(d)) s.flooredHits++;
            dealtThisTurn[b.who] = (dealtThisTurn[b.who] ?? 0) + dealt;

            // Place the roll within its declared band. Skipped for synthesized
            // entities and for degenerate bands where min equals max.
            const band = bands[b.who]?.get(d.type);
            if (lk && band && band.max > band.min) {
              const pct = (100 * (d.raw - band.min)) / (band.max - band.min);
              const roll: BandedRoll = { turn: t.n, type: d.type, raw: d.raw, min: band.min, max: band.max, pct };
              lk.rolls.push(roll);
              if (pct >= 90) lk.hot++;
              if (pct <= 10) lk.cold++;
            }

            s.byType[d.type] = (s.byType[d.type] ?? 0) + dealt;
            s.rawByType[d.type] = (s.rawByType[d.type] ?? 0) + d.raw;
            s.resistLossByType[d.type] = (s.resistLossByType[d.type] ?? 0) + resistLoss;
          }
          break;
        }
        case 'damaged':
          if (b.who in hp) hp[b.who] = b.hp;
          break;
        default:
          break;
      }
    }

    if (t.n) {
      series[player]!.push({ turn: t.n, hp: hp[player]! });
      series[monster]!.push({ turn: t.n, hp: hp[monster]! });
      turnDamage.push({ turn: t.n, dealt: dealtThisTurn });
    }

    // Gained moves but never spent any, which is the attack-speed tax made visible.
    for (const g of gainedThisTurn) {
      if (spentThisTurn.has(g.who)) continue;
      const need = attackCost(fight, g.who);
      const short = need != null && g.movesLeft != null
        ? Number((need - g.movesLeft).toFixed(2))
        : null;
      (stalled[g.who] ??= []).push({ turn: t.n, movesLeft: g.movesLeft, need, short });
    }
  }

  const totalTurns = turnsSeen.length ? Math.max(...turnsSeen) : 0;
  const finalPlayerHp = hp[player] ?? null;
  const finalMonsterHp = hp[monster] ?? null;

  const overkillOn = (finalMonsterHp ?? 0) < 0 ? monster : (finalPlayerHp ?? 0) < 0 ? player : null;
  const overkill = overkillOn
    ? Math.abs((overkillOn === monster ? finalMonsterHp : finalPlayerHp) ?? 0)
    : 0;

  /**
   * Real absorption is raw minus dealt, NOT the sum of stated AC cuts. Dundor
   * prints "reduces the damage by 140" against a 24-damage hit and then floors
   * the result at 1; summing the stated cuts reports absurd mitigation (743%
   * in one real log).
   */
  const mitigationFor = (who: string): Mitigation => {
    const foe = who === player ? monster : player;
    const s = stats[foe]!;
    const incomingRaw = s.rawRolled;
    const taken = s.dealt;
    return {
      incomingRaw,
      taken,
      absorbed: Math.max(0, incomingRaw - taken),
      pct: incomingRaw ? ((incomingRaw - taken) / incomingRaw) * 100 : 0,
      acStated: s.acAbsorbedByFoe,
      flooredHits: s.flooredHits,
    };
  };

  for (const l of Object.values(luck)) {
    l.avgPct = l.rolls.length ? l.rolls.reduce((n, r) => n + r.pct, 0) / l.rolls.length : null;
    l.expectedHits = Number(l.expectedHits.toFixed(2));
  }

  const rate = (who: string): number | null => {
    const s = stats[who]!;
    return s.attacks ? (s.hits / s.attacks) * 100 : null;
  };

  return {
    player,
    monster,
    stats,
    stalled,
    series,
    turnsSeen,
    totalTurns,
    firstAttackTurn,
    closedAt,
    approachTurns: firstAttackTurn ? turnsSeen.filter((n) => n < firstAttackTurn!).length : 0,
    overkill,
    overkillOn,
    finalPlayerHp,
    finalMonsterHp,
    events,
    playerMitigation: mitigationFor(player),
    monsterMitigation: mitigationFor(monster),
    playerHitRate: rate(player),
    monsterHitRate: rate(monster),
    startHpPct:
      fight.startHp[player] != null && fight.maxHp[player]
        ? (fight.startHp[player]! / fight.maxHp[player]!) * 100
        : null,
    luck,
    turnDamage,
  };
}

/** Aggregate several analysed fights into session totals. */
export function summarize(items: Array<{ fight: Fight; analysis: Analysis }>) {
  const sum = (fn: (x: { fight: Fight; analysis: Analysis }) => number) =>
    items.reduce((n, x) => n + fn(x), 0);

  const wins = items.filter((x) => x.fight.outcome.winner === x.analysis.player).length;
  const swings = sum((x) => x.analysis.stats[x.analysis.player]!.attacks);
  const hits = sum((x) => x.analysis.stats[x.analysis.player]!.hits);
  const turns = sum((x) => x.analysis.totalTurns);
  const rawAt = sum((x) => x.analysis.playerMitigation.incomingRaw);
  const taken = sum((x) => x.analysis.playerMitigation.taken);
  const dealt = sum((x) => x.analysis.stats[x.analysis.player]!.dealt);

  return {
    fights: items.length,
    wins,
    losses: items.length - wins,
    dealt,
    taken,
    incomingRaw: rawAt,
    absorbedPct: rawAt ? ((rawAt - taken) / rawAt) * 100 : 0,
    swings,
    hits,
    hitRate: swings ? (hits / swings) * 100 : null,
    turns,
    approachTurns: sum((x) => x.analysis.approachTurns),
    stalls: sum((x) => (x.analysis.stalled[x.analysis.player] ?? []).length),
    overkill: sum((x) => (x.analysis.overkillOn === x.analysis.monster ? x.analysis.overkill : 0)),
    movesPerTurn: MOVES_PER_TURN,
  };
}
