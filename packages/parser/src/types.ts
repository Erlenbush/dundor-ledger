/** Damage element as Dundor names it: "physical", "poison", "fire", … */
export type DamageType = string;

/** A damage band from an entity's stat block. */
export interface DamageInfo {
  emoji: string;
  type: DamageType;
  min: number;
  max: number;
}

/** One damage instance inside a landed attack, with its full mitigation chain. */
export interface DamageInstance {
  by: string;
  emoji: string;
  type: DamageType;
  /** The attacker's roll, before any mitigation. */
  raw: number;
  resistPct?: number;
  afterResist?: number;
  acRoll?: number;
  /** Reduction as the log STATES it. Frequently larger than the damage available. */
  acCut?: number;
  afterAc?: number;
  dealt?: number;
  victim?: string;
  hpAfter?: number;
  hpMax?: number;
}

export type Beat =
  | { t: 'gains'; who: string; amount: number | null; movesLeft: number | null;
      hp: number; hpMax: number; mp: number; mpMax: number }
  | { t: 'move'; who: string; spaces: number; target: string; distance: number }
  | { t: 'sneak'; who: string; spaces: number; target: string; distance: number }
  | { t: 'uses'; who: string; amount: number | null; movesLeft: number | null }
  | { t: 'miss'; who: string; roll: number; threshold: number }
  | { t: 'hit'; who: string; target: string; roll: number; threshold: number; damages: DamageInstance[] }
  | { t: 'damaged'; who: string; amount: number; hp: number; hpMax: number }
  | { t: 'effect'; who: string; effect: string }
  | { t: 'dies'; who: string }
  | { t: 'wins'; who: string; because: string }
  | { t: 'raw'; text: string };

export interface Turn {
  n: number;
  beats: Beat[];
}

export interface FightEntity {
  name: string;
  kind: 'player' | 'monster' | 'unknown';
  /** True when no stat block existed and the entity was inferred from the log body. */
  synthesized: boolean;
  /** Flattened "Key: value" pairs from the stat dump, values kept as strings. */
  stats: Record<string, string>;
  damages: DamageInfo[];
}

export interface Outcome {
  winner: string | null;
  loser: string | null;
  decided: boolean;
}

export interface Fight {
  playerName: string;
  monsterName: string;
  entities: Record<string, FightEntity>;
  maxHp: Record<string, number | null>;
  /**
   * Hit points each combatant STARTED with. Not the same as `maxHp`, since a
   * player can walk into a fight already hurt. Seeding a chart from the maximum
   * invents damage that never happened.
   */
  startHp: Record<string, number | null>;
  startDistance: number | null;
  firstMover: string | null;
  /** The player opened before being noticed. */
  ambush: boolean;
  turns: Turn[];
  outcome: Outcome;
}

export interface RollMargin {
  turn: number;
  /** Absolute distance between roll and threshold. Smaller is closer to a coin flip. */
  margin: number;
  roll: number;
  threshold: number;
}

export interface CombatantStats {
  attacks: number;
  hits: number;
  misses: number;
  /** Sum of every damage roll before mitigation. */
  rawRolled: number;
  /** Sum of damage that actually landed. */
  dealt: number;
  /** Sum of AC reductions as STATED by the log. Inflated; see `Mitigation`. */
  acAbsorbedByFoe: number;
  resistAbsorbedByFoe: number;
  /** Hits where AC would have wiped the damage but the 1-point floor let it through. */
  flooredHits: number;
  byType: Record<DamageType, number>;
  rawByType: Record<DamageType, number>;
  resistLossByType: Record<DamageType, number>;
  nearMisses: RollMargin[];
  nearHits: RollMargin[];
}

export interface Mitigation {
  incomingRaw: number;
  /** raw − taken. The honest figure; never exceeds `incomingRaw`. */
  absorbed: number;
  taken: number;
  pct: number;
  /** What the log claimed it reduced. Kept only to show how far off it is. */
  acStated: number;
  flooredHits: number;
}

export interface HpPoint {
  turn: number;
  hp: number | null;
}

/** One damage roll located within its declared band. */
export interface BandedRoll {
  turn: number;
  type: DamageType;
  raw: number;
  min: number;
  max: number;
  /** Where the roll fell in the band: 0 is the minimum, 100 the maximum. */
  pct: number;
}

/**
 * How the dice treated one combatant. Damage bands and evade thresholds are
 * both printed in the log, so expected values are computable exactly.
 */
export interface Luck {
  rolls: BandedRoll[];
  /** Mean band position across all damage rolls. 50 is neutral. */
  avgPct: number | null;
  /** Rolls at or above the 90th band percentile. */
  hot: number;
  /** Rolls at or below the 10th band percentile. */
  cold: number;
  attacks: number;
  hits: number;
  /** Sum of per-attack hit probabilities, i.e. hits a fair run would produce. */
  expectedHits: number;
}

export interface TurnDamage {
  turn: number;
  /** Damage each actor DEALT this turn, after mitigation. */
  dealt: Record<string, number>;
}

export interface StalledTurn {
  turn: number;
  movesLeft: number | null;
  /** Moves an attack costs, from the entity's Attack Speed. */
  need: number | null;
  /** How far short of an attack the entity was. */
  short: number | null;
}

export interface Analysis {
  player: string;
  monster: string;
  stats: Record<string, CombatantStats>;
  stalled: Record<string, StalledTurn[]>;
  series: Record<string, HpPoint[]>;
  turnsSeen: number[];
  totalTurns: number;
  /** Turn of the first attack by either side. */
  firstAttackTurn: number | null;
  /** Turn the gap first reached zero. */
  closedAt: number | null;
  approachTurns: number;
  overkill: number;
  overkillOn: string | null;
  finalPlayerHp: number | null;
  finalMonsterHp: number | null;
  /** Player HP at the opening bell, as a share of their maximum. */
  startHpPct: number | null;
  luck: Record<string, Luck>;
  /** Post-mitigation damage per logged turn, for the damage chart. */
  turnDamage: TurnDamage[];
  events: number;
  playerMitigation: Mitigation;
  monsterMitigation: Mitigation;
  playerHitRate: number | null;
  monsterHitRate: number | null;
}

export type Severity = 'critical' | 'warning' | 'good' | 'note';

/**
 * A derived finding. `body` uses a tiny markup: **bold** and *italic*. Kept as
 * text rather than HTML so the parser stays renderer-agnostic.
 */
export interface Insight {
  id: string;
  severity: Severity;
  tag: string;
  headline: string;
  body: string;
}
