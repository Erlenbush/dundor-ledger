// Smoke test for the Dundor log parser.
// Extracts sections 1-2 (parser + analytics) straight out of index.html so the
// test always exercises the shipped code, then asserts against the sample fight.
//
//   node parser-smoke-test.mjs

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = import.meta.dirname;
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');

const body = html.slice(html.indexOf('const RE = {'));
const parserSrc = body.slice(0, body.indexOf('3. RENDER') - 70);
const sStart = body.indexOf('const SAMPLE = `');
const sampleSrc = body.slice(sStart, body.indexOf('`;', sStart) + 2);

const tmp = path.join(here, '.parser.mjs');
fs.writeFileSync(tmp, `${parserSrc}\n${sampleSrc}\nexport { parseFight, analyze, splitLogs, SAMPLE };`);

let mod;
try {
  mod = await import(`file://${tmp}`);
} finally {
  fs.rmSync(tmp, { force: true });
}
const { parseFight, analyze, splitLogs, SAMPLE } = mod;

const f = parseFight(SAMPLE);
const A = analyze(f);
const { P, M } = A;

let n = 0;
const check = (label, actual, expected) => {
  assert.deepStrictEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label} = ${JSON.stringify(actual)}`);
  n++;
};

console.log('identity');
check('player', P, 'food_');
check('monster', M, 'Greater Lizard');
check('player max HP', f.maxHp[P], 118);
check('monster max HP', f.maxHp[M], 98);
check('opening distance', f.startDistance, 8);
check('ambush opener', f.firstMover, 'food_');
check('outcome', f.outcome, { winner: 'food_', loser: 'Greater Lizard', decided: true });

console.log('structure');
// Turn 2 is absent from the log — the parser must not assume a dense sequence.
check('turns logged', A.turnsSeen, [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
check('final turn', A.totalTurns, 17);
check('contact turn', A.closedAt, 8);
check('first swing', A.firstAttackTurn, 11);
check('events parsed', A.events, 52);

console.log('player offense');
check('swings', A.s[P].attacks, 3);
check('hits', A.s[P].hits, 2);
check('raw rolled', A.s[P].rawRolled, 144);   // 46 + 23 + 60 + 15
check('effective dealt', A.s[P].dealt, 120);  // 42 + 15 + 53 + 10
check('damage by type', A.s[P].byType, { physical: 95, poison: 25 });
check('overkill', A.overkill, 22);            // monster ended at -22/98
check('overkill target', A.overkillOn, 'Greater Lizard');

console.log('player defense');
check('incoming raw', A.mitP.incomingRaw, 51);   // 24 + 7 + 20
check('damage taken', A.mitP.taken, 3);          // floored to 1, three times
check('real absorption', A.mitP.absorbed, 48);
check('mitigation %', Math.round(A.mitP.pct * 10) / 10, 94.1);
check('floored hits', A.mitP.flooredHits, 3);
// The log claims 140+132+107 reduced against only 51 incoming. Summing the
// stated cuts would report 743% mitigation — the bug this asserts against.
check('stated cuts (inflated)', A.mitP.acStated, 379);
assert.ok(A.mitP.pct <= 100, 'mitigation must never exceed 100%');
console.log('  ok  mitigation <= 100%');
n++;

console.log('move economy');
check('player stalled turns', A.idle[P].map(i => i.turn), [9, 15]);
check('player shortfalls', A.idle[P].map(i => i.short), [0.4, 0.2]);
check('monster stalled turns', A.idle[M].map(i => i.turn), [10]);

console.log('near miss');
check('turn-11 margin (2dp)', +A.s[P].nearMisses[0].margin.toFixed(2), 0.46);

console.log('stat block parsing');
check('AC', f.entities[P].Ac, '169');
check('attack speed', f.entities[P]['Attack Speed'], '1.4');
check('strength (trailing-space key)', f.entities[P].Str, '52');
check('intelligence (trailing-space key)', f.entities[P].Int, '12');
check('god', f.entities[P].God, 'Stcafetra');
check('damage types', f.entities[P]._damages.map(d => `${d.type} ${d.min}-${d.max}`),
  ['physical 41-138', 'poison 10-34']);
check('monster poison resist', f.entities[M].Rpois, '1');

console.log('degraded input');
assert.throws(() => parseFight('not a fight log'), /Logs/, 'garbage should throw a readable error');
console.log('  ok  garbage input throws');
n++;

const logsOnly = parseFight([
  'Logs ------------',
  'TURN 1 ------------',
  '[hero] gains 1.0 moves. Moves left = 1.0. HP left: 40/40. Mana left: 0/0.',
  '[goblin] gets damaged by 9 damage! HP Left = -4/15.',
  '[goblin] dies!',
  '[hero] wins the fight because [goblin] has died!',
].join('\n'));
check('logs-only: player', logsOnly.playerName, 'hero');
check('logs-only: monster', logsOnly.monsterName, 'goblin');
check('logs-only: HP recovered from log', [logsOnly.maxHp.hero, logsOnly.maxHp.goblin], [40, 15]);


// ── Real fixtures: three Lava Golem fights at XL 24/25/26 ────────────────────
const fx = (name) => fs.readFileSync(path.join(here, '..', 'fixtures', name), 'utf8');

console.log('multi-fight paste');
const pairText = fx('two-fights-one-paste.txt');
const chunks = splitLogs(pairText);
check('splits into fights', chunks.length, 2);

// Regression: before splitLogs, this produced turnsSeen 1,3..19,1,3..15 and
// reported 471 damage dealt instead of 211 — two fights silently merged.
const merged = analyze(parseFight(pairText));
check('direct parse stops at fight 1', merged.totalTurns, 19);
check('no duplicated turns', merged.turnsSeen.length, new Set(merged.turnsSeen).size);
check('damage not doubled', merged.s[merged.P].dealt, 211);

const golem = ['lava-golem-xl24.txt', 'lava-golem-xl25.txt', 'lava-golem-xl26.txt']
  .map(n => { const f = parseFight(fx(n)); return { f, A: analyze(f) }; });

console.log('per-fight totals (XL 24 / 25 / 26)');
check('levels', golem.map(g => g.f.entities[g.A.P].Xl), ['24', '25', '26']);
check('max HP climbs', golem.map(g => g.f.maxHp[g.A.P]), [231, 241, 254]);
check('turns', golem.map(g => g.A.totalTurns), [19, 15, 17]);
check('damage dealt', golem.map(g => g.A.s[g.A.P].dealt), [211, 260, 395]);
check('damage taken', golem.map(g => g.A.mitP.taken), [12, 6, 4]);
check('overkill', golem.map(g => g.A.overkill), [11, 60, 195]);

console.log('two-element attacker');
// The golem swings physical AND fire; both must be attributed separately.
const g1 = golem[0];
check('monster damage types', g1.f.entities[g1.A.M]._damages.map(d => d.type), ['physical', 'fire']);
check('incoming raw across both elements', g1.A.mitP.incomingRaw, 434);
check('all incoming floored to 1', g1.A.mitP.flooredHits, 12);

console.log('resistances and vulnerabilities');
check('golem resists fire', g1.f.entities[g1.A.M].Rfire, '4');
check('golem resists poison', g1.f.entities[g1.A.M].Rpois, '2');
// Negative pips were previously filtered out of the stat block entirely.
check('golem is COLD-VULNERABLE', g1.f.entities[g1.A.M].Rcold, '-2');
// 2 pips of poison resistance removed 33.33% -> 100/6 per pip.
check('poison raw rolled', g1.A.s[g1.A.P].rawByType.poison, 66);
check('poison lost to resistance', g1.A.s[g1.A.P].resistLossByType.poison, 21);
check('physical lost nothing', g1.A.s[g1.A.P].resistLossByType.physical, 0);

console.log('razor-thin rolls');
// Landed by 0.014 — a near HIT, which the miss-only logic could never surface.
check('XL24 near-hit turn', g1.A.s[g1.A.P].nearHits.map(h => h.turn), [11]);
check('XL24 near-hit margin', +g1.A.s[g1.A.P].nearHits[0].margin.toFixed(5), 0.01402);
const g3 = golem[2];
check('XL26 monster near-miss margin',
  +g3.A.s[g3.A.M].nearMisses.filter(x => x.margin < 2)[0].margin.toFixed(5), 0.23826);

console.log('move economy at low attack speed');
// Speed 1.06-1.09 vs 1.0 regen: one stalled turn each, not the 1.4 weapon's many.
check('stalls per fight', golem.map(g => (g.A.idle[g.A.P] || []).length), [1, 1, 1]);

console.log(`\n${n} assertions passed.`);
