import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyze, deriveInsights, exportFights, parseFight, splitLogs, summarize } from './index.js';
import type { Analysis, Fight } from './types.js';

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');
const read = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const load = (name: string): { fight: Fight; analysis: Analysis } => {
  const fight = parseFight(read(name));
  return { fight, analysis: analyze(fight) };
};

describe('splitLogs', () => {
  it('separates several fights held in one paste', () => {
    expect(splitLogs(read('two-fights-one-paste.txt'))).toHaveLength(2);
  });

  it('leaves a single fight untouched', () => {
    const text = read('lava-golem-xl24.txt');
    expect(splitLogs(text)).toEqual([text]);
  });

  it('returns the whole text when there is no header at all', () => {
    const text = 'Logs ---\nTURN 1 ---\n[a] dies!';
    expect(splitLogs(text)).toEqual([text]);
  });
});

describe('multi-fight regression', () => {
  // Before splitLogs existed this produced turnsSeen 1,3..19,1,3..15 and
  // reported 471 damage dealt where fight one dealt 211, with two fights merged
  // into a single silently-wrong record.
  const text = read('two-fights-one-paste.txt');
  const analysis = analyze(parseFight(text));

  it('stops a direct parse at the first fight', () => {
    expect(analysis.totalTurns).toBe(19);
  });

  it('never repeats a turn number', () => {
    expect(new Set(analysis.turnsSeen).size).toBe(analysis.turnsSeen.length);
  });

  it('does not sum damage across fights', () => {
    expect(analysis.stats[analysis.player]!.dealt).toBe(211);
  });
});

describe('identity and structure', () => {
  const { fight, analysis } = load('lava-golem-xl24.txt');

  it('reads the combatants from the header', () => {
    expect([fight.playerName, fight.monsterName]).toEqual(['food_', 'Lava Golem']);
  });

  it('classifies player and monster from their stat blocks', () => {
    expect(fight.entities['food_']!.kind).toBe('player');
    expect(fight.entities['Lava Golem']!.kind).toBe('monster');
  });

  it('records the opening distance and ambush', () => {
    expect(fight.startDistance).toBe(7);
    expect(fight.firstMover).toBe('food_');
    expect(fight.ambush).toBe(true);
  });

  it('tolerates non-contiguous turn numbers', () => {
    // The log jumps straight from TURN 1 to TURN 3.
    expect(analysis.turnsSeen).not.toContain(2);
    expect(analysis.turnsSeen[0]).toBe(1);
    expect(analysis.turnsSeen[1]).toBe(3);
    expect(analysis.totalTurns).toBe(19);
  });

  it('locates contact and the first swing', () => {
    expect(analysis.closedAt).toBe(7);
    expect(analysis.firstAttackTurn).toBe(8);
    expect(analysis.approachTurns).toBe(6);
  });

  it('resolves the outcome', () => {
    expect(fight.outcome).toEqual({ winner: 'food_', loser: 'Lava Golem', decided: true });
  });
});

describe('stat block parsing', () => {
  const { fight } = load('lava-golem-xl24.txt');
  const p = fight.entities['food_']!;
  const m = fight.entities['Lava Golem']!;

  it('reads keys written with a trailing space before the colon', () => {
    // The log writes "Str : 57". Untrimmed, these were unreachable.
    expect(p.stats['Str']).toBe('57');
    expect(p.stats['Int']).toBe('12');
  });

  it('reads the ordinary scalars', () => {
    expect(p.stats['Ac']).toBe('198');
    expect(p.stats['Attack Speed']).toBe('1.09');
    expect(p.stats['Xl']).toBe('24');
    expect(p.stats['God']).toBe('Stcafetra');
  });

  it('parses every damage band', () => {
    expect(p.damages.map((d) => `${d.type} ${d.min}-${d.max}`))
      .toEqual(['physical 60-201', 'poison 15-50']);
    expect(m.damages.map((d) => d.type)).toEqual(['physical', 'fire']);
  });

  it('keeps negative resistances, which are vulnerabilities', () => {
    expect(m.stats['Rfire']).toBe('4');
    expect(m.stats['Rpois']).toBe('2');
    expect(m.stats['Rcold']).toBe('-2');
  });
});

describe('damage accounting', () => {
  const { analysis } = load('lava-golem-xl24.txt');
  const mine = analysis.stats[analysis.player]!;

  it('separates raw rolls from what landed', () => {
    expect(mine.rawRolled).toBe(256);
    expect(mine.dealt).toBe(211);
  });

  it('attributes damage per element', () => {
    expect(mine.byType).toEqual({ physical: 178, poison: 33 });
    expect(mine.rawByType).toEqual({ physical: 190, poison: 66 });
  });

  it('charges resistance loss only to the resisted element', () => {
    // 2 pips of poison resistance removed 33.33%.
    expect(mine.resistLossByType['poison']).toBe(21);
    expect(mine.resistLossByType['physical']).toBe(0);
  });

  it('counts overkill against whoever died', () => {
    expect(analysis.overkillOn).toBe('Lava Golem');
    expect(analysis.overkill).toBe(11);
  });
});

describe('mitigation', () => {
  const { analysis } = load('lava-golem-xl24.txt');
  const mit = analysis.playerMitigation;

  it('measures absorption as raw minus taken', () => {
    expect(mit.incomingRaw).toBe(434);
    expect(mit.taken).toBe(12);
    expect(mit.absorbed).toBe(422);
  });

  it('never exceeds 100%', () => {
    // Summing the log's STATED AC cuts reported 743% on an earlier fixture.
    expect(mit.pct).toBeLessThanOrEqual(100);
    expect(mit.pct).toBeCloseTo(97.2, 1);
  });

  it('keeps the inflated claim from the log only for comparison', () => {
    expect(mit.acStated).toBeGreaterThan(mit.absorbed);
  });

  it('counts hits saved by the damage floor', () => {
    // Six two-element attacks, every component floored to 1.
    expect(mit.flooredHits).toBe(12);
  });
});

describe('razor-thin rolls', () => {
  it('surfaces a hit that landed by a hair', () => {
    const { analysis } = load('lava-golem-xl24.txt');
    const hits = analysis.stats[analysis.player]!.nearHits;
    expect(hits.map((h) => h.turn)).toEqual([11]);
    expect(hits[0]!.margin).toBeCloseTo(0.01402, 5);
  });

  it('surfaces a monster miss that failed by a hair', () => {
    const { analysis } = load('lava-golem-xl26.txt');
    const near = analysis.stats[analysis.monster]!.nearMisses.filter((n) => n.margin < 2);
    expect(near[0]!.margin).toBeCloseTo(0.23826, 5);
  });
});

describe('move economy', () => {
  it('flags turns stalled short of an attack', () => {
    const { analysis } = load('lava-golem-xl24.txt');
    const stalls = analysis.stalled[analysis.player]!;
    expect(stalls.map((s) => s.turn)).toEqual([9]);
    // Regains 1.0 a turn, a swing costs 1.09.
    expect(stalls[0]!.short).toBeCloseTo(0.09, 2);
  });
});

describe('progression across three fights', () => {
  const fights = ['lava-golem-xl24.txt', 'lava-golem-xl25.txt', 'lava-golem-xl26.txt'].map(load);

  it('tracks the character levelling', () => {
    expect(fights.map((f) => f.fight.entities['food_']!.stats['Xl'])).toEqual(['24', '25', '26']);
    expect(fights.map((f) => f.fight.maxHp['food_'])).toEqual([231, 241, 254]);
  });

  it('reports each fight independently', () => {
    expect(fights.map((f) => f.analysis.totalTurns)).toEqual([19, 15, 17]);
    expect(fights.map((f) => f.analysis.stats[f.analysis.player]!.dealt)).toEqual([211, 260, 395]);
    expect(fights.map((f) => f.analysis.playerMitigation.taken)).toEqual([12, 6, 4]);
    expect(fights.map((f) => f.analysis.overkill)).toEqual([11, 60, 195]);
  });

  it('aggregates a session', () => {
    const s = summarize(fights);
    expect(s.fights).toBe(3);
    expect(s.wins).toBe(3);
    expect(s.dealt).toBe(866);
    expect(s.taken).toBe(22);
    expect(s.hits).toBe(6);
    expect(s.swings).toBe(12);
    expect(s.hitRate).toBeCloseTo(50, 5);
    expect(s.overkill).toBe(266);
  });
});

describe('degraded input', () => {
  it('rejects text with no log section', () => {
    expect(() => parseFight('not a fight log')).toThrow(/Logs/);
  });

  it('recovers identity and HP from a log pasted without its stat header', () => {
    const fight = parseFight([
      'Logs ------------',
      'TURN 1 ------------',
      '[hero] gains 1.0 moves. Moves left = 1.0. HP left: 40/40. Mana left: 0/0.',
      '[goblin] gets damaged by 9 damage! HP Left = -4/15.',
      '[goblin] dies!',
      '[hero] wins the fight because [goblin] has died!',
    ].join('\n'));

    expect(fight.playerName).toBe('hero');
    expect(fight.monsterName).toBe('goblin');
    expect(fight.maxHp).toEqual({ hero: 40, goblin: 15 });
    expect(fight.entities['hero']!.synthesized).toBe(true);
  });

  it('handles a loss without assuming the player won', () => {
    const fight = parseFight([
      'The fight happens between food_ and Dragon!',
      'Logs ------------',
      'TURN 1 ------------',
      '[food_] gains 1.0 moves. Moves left = 1.0. HP left: 118/118. Mana left: 0/0.',
      '[Dragon] hits [food_] with a melee attack! Applying each damage. [evade roll: 99.0 > 5.0].',
      '[Dragon] rolls 200 for :fire: fire!',
      '[food_] gets damaged by 200 damage! HP Left = -82/118.',
      '[food_] dies!',
      '[Dragon] wins the fight because [food_] has died!',
    ].join('\n'));
    const a = analyze(fight);

    expect(fight.outcome.winner).toBe('Dragon');
    expect(a.overkillOn).toBe('food_');
    expect(a.overkill).toBe(82);
  });
});

describe('a fight the player lost', () => {
  // The first loss log, and it exposed two bugs: HP charted from the maximum
  // rather than what the player walked in with, and an unhandled log line.
  const { fight, analysis: a } = load('magma-golem-loss-xl35.txt');

  it('records the loss without assuming a win', () => {
    expect(fight.outcome).toEqual({ winner: 'Magma Golem', loser: 'food_', decided: true });
    expect(a.finalPlayerHp).toBe(-7);
    expect(a.overkillOn).toBe('food_');
    expect(a.overkill).toBe(7);
  });

  it('reads starting HP from the entity header, not the maximum', () => {
    // "Hp Left: 47" above "Hp: 389". The player walked in at 12% health.
    expect(fight.startHp['food_']).toBe(47);
    expect(fight.maxHp['food_']).toBe(389);
    expect(a.startHpPct).toBeCloseTo(12.08, 1);
  });

  it('does not chart a cliff the player never took', () => {
    // Seeding from maxHp drew 389 -> 47 between turns 1 and 3: 342 phantom damage.
    const series = a.series['food_']!;
    expect(series[0]).toEqual({ turn: 0, hp: 47 });
    const drops = series.slice(1).map((p, i) => (series[i]!.hp ?? 0) - (p.hp ?? 0));
    // Largest real drop is turn 12: 1 physical + 51 fire = 52, taking 44 to -7.
    expect(Math.max(...drops)).toBe(52);
  });

  it('parses the on-hit effect proc', () => {
    const effects = fight.turns.flatMap((t) =>
      t.beats.filter((b) => b.t === 'effect').map((b) => ({ turn: t.n, ...b })));
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ turn: 11, who: 'food_', effect: 'poisoned' });
  });

  it('leaves no log line unrecognised', () => {
    const unknown = fight.turns.flatMap((t) => t.beats.filter((b) => b.t === 'raw'));
    expect(unknown).toEqual([]);
  });

  it('still accounts damage correctly', () => {
    expect(a.playerMitigation.incomingRaw).toBe(570);
    expect(a.playerMitigation.taken).toBe(54);      // 47 - 54 = -7
    expect(a.stats['food_']!.dealt).toBe(346);
  });

  it('never stalls at attack speed below 1.0', () => {
    // 0.78 per swing against 1.0 regained, which is a surplus rather than a deficit.
    expect(a.stalled['food_']).toEqual([]);
  });
});

describe('insights on a loss', () => {
  const { fight, analysis: a } = load('magma-golem-loss-xl35.txt');
  const insights = deriveInsights(fight, a);
  const ids = insights.map((i) => i.id);
  const byId = Object.fromEntries(insights.map((i) => [i.id, i]));

  it('does not claim the armour won a fight the player died in', () => {
    // Mitigation was 90.5%, which previously triggered "made this a non-fight".
    expect(a.playerMitigation.pct).toBeGreaterThan(75);
    expect(ids).not.toContain('defense');
  });

  it('leads on entry HP, which is what actually killed them', () => {
    expect(ids).toContain('low-hp-start');
    expect(byId['low-hp-start']!.severity).toBe('critical');
    expect(byId['low-hp-start']!.body).toContain('335/389');   // survivable at full health
  });

  it('identifies the killing blow and its element', () => {
    expect(byId['killing-blow']!.headline).toBe('A 340-point fire roll finished you.');
    expect(byId['killing-blow']!.body).toContain('102–340');
  });

  it('reads the five-pip cold vulnerability', () => {
    expect(byId['matchup']!.headline).toContain('vulnerable to cold');
    expect(byId['matchup']!.body).toContain('83% harder');
  });
});

describe('roll luck', () => {
  it('computes expected hits from the printed evade thresholds', () => {
    const { analysis: a } = load('lava-golem-xl24.txt');
    const mine = a.luck[a.player]!;
    const theirs = a.luck[a.monster]!;
    // Player: 5 swings against a 16.11% evade minus one sneak-modified turn.
    expect(mine.attacks).toBe(5);
    expect(mine.hits).toBe(2);
    expect(mine.expectedHits).toBeCloseTo(3.66, 2);
    // The golem landed all six where a fair run produces 4.27.
    expect(theirs.attacks).toBe(6);
    expect(theirs.hits).toBe(6);
    expect(theirs.expectedHits).toBeCloseTo(4.27, 2);
  });

  it('places each damage roll within its declared band', () => {
    const { analysis: a } = load('magma-golem-loss-xl35.txt');
    const golem = a.luck[a.monster]!;
    // The killing 340 came from a 102-340 fire band, i.e. the 100th percentile.
    const top = golem.rolls.find((r) => r.raw === 340)!;
    expect(top.type).toBe('fire');
    expect(top.pct).toBe(100);
    expect(golem.hot).toBe(1);
    // The player rolled low overall: 93%, 8%, 12%, 10% averages under a third.
    expect(a.luck[a.player]!.avgPct).toBeCloseTo(30.9, 1);
  });

  it('skips banding when the entity has no declared damages', () => {
    const fight = parseFight([
      'Logs ------------',
      'TURN 1 ------------',
      '[hero] hits [goblin] with a melee attack! Applying each damage. [evade roll: 90.0 > 10.0].',
      '[hero] rolls 12 for :punch: physical!',
      '[goblin] gets damaged by 12 damage! HP Left = 3/15.',
      '[goblin] dies!',
      '[hero] wins the fight because [goblin] has died!',
    ].join('\n'));
    const a = analyze(fight);
    expect(a.luck['hero']!.rolls).toEqual([]);
    expect(a.luck['hero']!.avgPct).toBeNull();
    expect(a.luck['hero']!.expectedHits).toBeCloseTo(0.9, 5);
  });
});

describe('damage per turn', () => {
  it('sums post-mitigation damage for each logged turn', () => {
    const { analysis: a } = load('magma-golem-loss-xl35.txt');
    const by = Object.fromEntries(a.turnDamage.map((t) => [t.turn, t.dealt]));
    // Turn 9: 253 physical + 1 floored poison from the player.
    expect(by[9]![a.player]).toBe(254);
    expect(by[9]![a.monster]).toBe(0);
    // Turn 12: 1 floored physical + 51 fire, the killing turn.
    expect(by[12]![a.monster]).toBe(52);
    // Walking turns carry zeroes rather than being dropped, so charts stay aligned.
    expect(by[3]).toEqual({ [a.player]: 0, [a.monster]: 0 });
  });
});

describe('dice insight', () => {
  it('reports the accuracy swing in the XL 24 fight', () => {
    const { fight, analysis } = load('lava-golem-xl24.txt');
    const dice = deriveInsights(fight, analysis).find((i) => i.id === 'dice')!;
    expect(dice.body).toContain('2 of 5 swings');
    expect(dice.body).toContain('3.66');
    expect(dice.body).toContain('6 of 6 swings');
  });

  it('reports the top-of-band killing roll in the loss', () => {
    const { fight, analysis } = load('magma-golem-loss-xl35.txt');
    const dice = deriveInsights(fight, analysis).find((i) => i.id === 'dice')!;
    expect(dice.body).toContain('**340**');
    expect(dice.body).toContain('31st percentile');
  });
});

describe('exportFights', () => {
  it('exports one entry per fight with fight, analysis and insights', () => {
    const out = exportFights(read('two-fights-one-paste.txt'), 'pair.txt');
    expect(out).toHaveLength(2);
    const first = out[0]!;
    if ('error' in first) throw new Error(first.error);
    expect(first.source).toBe('pair.txt');
    expect(first.fightIndex).toBe(0);
    expect(first.analysis.totalTurns).toBe(19);
    expect(first.insights.length).toBeGreaterThan(0);
  });

  it('round-trips through JSON without loss', () => {
    const out = exportFights(read('magma-golem-loss-xl35.txt'), 'loss');
    const back = JSON.parse(JSON.stringify(out));
    expect(back).toEqual(out);
  });

  it('turns a bad section into an error entry instead of throwing', () => {
    const out = exportFights('not a log at all', 'junk');
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveProperty('error');
  });
});

describe('insights', () => {
  const { fight, analysis } = load('lava-golem-xl24.txt');
  const insights = deriveInsights(fight, analysis);
  const byId = Object.fromEntries(insights.map((i) => [i.id, i]));

  it('leads with the element matchup', () => {
    expect(insights[0]!.id).toBe('matchup');
    expect(insights[0]!.severity).toBe('critical');
    expect(insights[0]!.headline).toContain('vulnerable to cold');
  });

  it('quantifies the element swap from real rolls', () => {
    // poison rolled 66 raw, lost 21 to resistance; cold would gain ~22.
    expect(byId['matchup']!.body).toContain('**66**');
    expect(byId['matchup']!.body).toContain('**21**');
    expect(byId['matchup']!.body).toContain('**43**');
  });

  it('reports accuracy as the real constraint', () => {
    expect(byId['accuracy']).toBeDefined();
    expect(byId['accuracy']!.headline).toBe('You landed 2 of 5 swings.');
  });

  it('does not claim overkill on a fight the player lost', () => {
    const lost = parseFight([
      'The fight happens between food_ and Dragon!',
      'Logs ------------',
      'TURN 1 ------------',
      '[food_] gains 1.0 moves. Moves left = 1.0. HP left: 10/10. Mana left: 0/0.',
      '[food_] dies!',
      '[Dragon] wins the fight because [food_] has died!',
    ].join('\n'));
    const ids = deriveInsights(lost, analyze(lost)).map((i) => i.id);
    expect(ids).not.toContain('overkill');
  });
});
