import { RE } from './patterns.js';
import type { Beat, DamageInfo, DamageInstance, Fight, FightEntity, Turn } from './types.js';

const num = (s: string): number | null => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Split a paste or attachment that holds several fights back to back.
 *
 * Dundor repeats its "The fight happens between" header per fight. Without
 * splitting, every fight merges into one record with duplicated turn numbers
 * and summed damage.
 */
export function splitLogs(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (RE.header.test(l.trim())) starts.push(i);
  });
  if (starts.length < 2) return [text];
  return starts.map((s, i) => lines.slice(s, starts[i + 1] ?? lines.length).join('\n'));
}

/** Flatten a stat block's indented "Key: value" lines. Keys are unique per entity. */
function parseStatBlock(name: string, lines: string[]): FightEntity {
  const stats: Record<string, string> = {};
  for (const raw of lines) {
    const m = raw.match(RE.statLine);
    if (!m) continue;
    const key = (m[1] ?? '').trim();
    const val = (m[2] ?? '').trim();
    // "Str :" carries a trailing space before the colon; trimming is what makes
    // `stats.Str` reachable at all.
    if (!key || !val || key === 'stats' || key === '- stats') continue;
    stats[key] = val;
  }

  const damages: DamageInfo[] = [];
  const src = stats['Damages'];
  if (src) {
    RE.damageInfo.lastIndex = 0;
    let d: RegExpExecArray | null;
    while ((d = RE.damageInfo.exec(src)) !== null) {
      damages.push({ emoji: d[1]!, type: (d[2] ?? '').trim(), min: Number(d[3]), max: Number(d[4]) });
    }
  }

  const kind: FightEntity['kind'] = lines.some((l) => /PlayerData:/.test(l))
    ? 'player'
    : lines.some((l) => /MonsterData:/.test(l))
      ? 'monster'
      : 'unknown';

  return { name, kind, synthesized: false, stats, damages };
}

/**
 * Parse ONE fight. If `text` holds several, only the first is read — use
 * {@link splitLogs} to separate them first.
 *
 * @throws if no "Logs ---" section or no identifiable combatants are present.
 */
export function parseFight(text: string): Fight {
  const lines = text.replace(/\r/g, '').split('\n');

  let headerNames: [string, string] | null = null;
  const blocks = new Map<string, string[]>();
  let cursor: string | null = null;
  let logStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h = line.match(RE.header);
    if (h) {
      headerNames = [(h[1] ?? '').trim(), (h[2] ?? '').trim()];
      continue;
    }
    const sf = line.match(RE.statsFor);
    if (sf) {
      cursor = (sf[1] ?? '').trim();
      blocks.set(cursor, []);
      continue;
    }
    if (RE.logsHdr.test(line)) {
      logStart = i + 1;
      cursor = null;
      break;
    }
    if (cursor) blocks.get(cursor)!.push(line);
  }

  if (logStart < 0) throw new Error('No “Logs ---” section — this isn’t a Dundor fight log.');

  const entities: Record<string, FightEntity> = {};
  for (const [name, blk] of blocks) entities[name] = parseStatBlock(name, blk);

  const turns: Turn[] = [];
  let startDistance: number | null = null;
  let firstMover: string | null = null;
  let ambush = false;
  const outcome: Fight['outcome'] = { winner: null, loser: null, decided: false };

  let turn: Turn | null = null;
  let pending: DamageInstance | null = null;
  let lastAttack: Extract<Beat, { t: 'hit' }> | null = null;

  const pushTurn = (n: number): void => {
    turn = { n, beats: [] };
    turns.push(turn);
  };
  const add = <B extends Beat>(b: B): B => {
    if (!turn) pushTurn(0);
    turn!.beats.push(b);
    return b;
  };

  for (let i = logStart; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;

    // A second header is the next fight in a multi-fight paste. Stop, so a
    // direct call can never bleed one fight into another.
    if (RE.header.test(line)) break;

    let m: RegExpMatchArray | null;

    if ((m = line.match(RE.turn))) {
      pushTurn(Number(m[1]));
      pending = null;
      lastAttack = null;
      continue;
    }
    if ((m = line.match(RE.dist))) { startDistance = Number(m[1]); continue; }
    if ((m = line.match(RE.first))) { firstMover = m[1]!; ambush = true; continue; }

    if ((m = line.match(RE.gains))) {
      add({ t: 'gains', who: m[1]!, amount: num(m[2]!), movesLeft: num(m[3]!),
            hp: Number(m[4]), hpMax: Number(m[5]), mp: Number(m[6]), mpMax: Number(m[7]) });
      continue;
    }
    if ((m = line.match(RE.sneak))) {
      add({ t: 'sneak', who: m[1]!, spaces: Number(m[2]), target: m[3]!, distance: Number(m[4]) });
      continue;
    }
    if ((m = line.match(RE.move))) {
      add({ t: 'move', who: m[1]!, spaces: Number(m[2]), target: m[3]!, distance: Number(m[4]) });
      continue;
    }
    if ((m = line.match(RE.uses))) {
      add({ t: 'uses', who: m[1]!, amount: num(m[2]!), movesLeft: num(m[3]!) });
      continue;
    }
    if ((m = line.match(RE.miss))) {
      add({ t: 'miss', who: m[1]!, roll: num(m[2]!)!, threshold: num(m[3]!)! });
      continue;
    }
    if ((m = line.match(RE.hit))) {
      lastAttack = add({ t: 'hit', who: m[1]!, target: m[2]!,
                         roll: num(m[3]!)!, threshold: num(m[4]!)!, damages: [] });
      continue;
    }

    // Must precede `roll` — both begin "[x] rolls N for".
    if ((m = line.match(RE.ac))) {
      if (pending) {
        pending.acRoll = Number(m[2]);
        pending.acCut = Number(m[3]);
        pending.afterAc = Number(m[4]);
      }
      continue;
    }
    if ((m = line.match(RE.resist))) {
      if (pending) {
        pending.resistPct = num(m[2]!) ?? undefined;
        pending.afterResist = Number(m[3]);
      }
      continue;
    }
    if ((m = line.match(RE.roll))) {
      pending = { by: m[1]!, emoji: m[3]!, type: (m[4] ?? '').trim(), raw: Number(m[2]) };
      if (lastAttack) lastAttack.damages.push(pending);
      continue;
    }
    if ((m = line.match(RE.damaged))) {
      const amount = Number(m[2]);
      const hp = Number(m[3]);
      const hpMax = Number(m[4]);
      if (pending) {
        pending.dealt = amount;
        pending.victim = m[1]!;
        pending.hpAfter = hp;
        pending.hpMax = hpMax;
      }
      add({ t: 'damaged', who: m[1]!, amount, hp, hpMax });
      pending = null;
      continue;
    }
    if ((m = line.match(RE.effect))) {
      add({ t: 'effect', who: m[1]!, effect: m[2]! });
      continue;
    }
    if ((m = line.match(RE.dies))) {
      add({ t: 'dies', who: m[1]! });
      outcome.loser = m[1]!;
      continue;
    }
    if ((m = line.match(RE.wins))) {
      add({ t: 'wins', who: m[1]!, because: m[2]! });
      outcome.winner = m[1]!;
      outcome.loser = m[2]!;
      outcome.decided = true;
      continue;
    }
    add({ t: 'raw', text: line });
  }

  // Resolve identity from the log body, so a log pasted without its stat header
  // still works. Order of first appearance decides when nothing else can.
  const seen: string[] = [];
  const observedMax: Record<string, number> = {};
  for (const t of turns) {
    for (const b of t.beats) {
      const who = 'who' in b ? b.who : null;
      if (!who) continue;
      if (!seen.includes(who)) seen.push(who);
      const hpMax = 'hpMax' in b ? b.hpMax : undefined;
      if (hpMax) observedMax[who] = Math.max(observedMax[who] ?? 0, hpMax);
    }
  }

  let names: string[] = headerNames ? [...headerNames] : [...blocks.keys()];
  if (names.length < 2) names = [...new Set([...names, ...seen])];
  let first = names[0];
  let second = names[1];
  if (entities[second!]?.kind === 'player' && entities[first!]?.kind !== 'player') {
    [first, second] = [second, first];
  }
  if (!first) throw new Error('Could not identify the combatants — is this a Dundor fight log?');
  const player = first;
  const monster = second ?? seen.find((n) => n !== first) ?? 'Opponent';

  for (const [i, n] of [player, monster].entries()) {
    if (!entities[n]) {
      entities[n] = { name: n, kind: i === 0 ? 'player' : 'monster',
                      synthesized: true, stats: {}, damages: [] };
    }
  }

  const statNum = (n: string, key: string): number | null => {
    const v = Number(entities[n]!.stats[key]);
    return Number.isFinite(v) ? v : null;
  };
  // `Hp` (inside PlayerData/MonsterData) is the maximum; `Hp Left` on the
  // FightEntity above it is what the combatant actually walked in with.
  const declared = (n: string) => statNum(n, 'Hp');
  const opening = (n: string) => statNum(n, 'Hp Left') ?? declared(n) ?? observedMax[n] ?? null;

  return {
    playerName: player,
    monsterName: monster,
    entities,
    maxHp: {
      [player]: declared(player) ?? observedMax[player] ?? null,
      [monster]: declared(monster) ?? observedMax[monster] ?? null,
    },
    startHp: {
      [player]: opening(player),
      [monster]: opening(monster),
    },
    startDistance,
    firstMover,
    ambush,
    turns,
    outcome,
  };
}

/** Split `text` into fights and parse each. Unparseable chunks are reported, not thrown. */
export function parseAll(text: string): Array<{ fight: Fight } | { error: string }> {
  return splitLogs(text).map((chunk) => {
    try {
      return { fight: parseFight(chunk) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
