/**
 * Resistance keys as they appear in a stat block, with the element they cover.
 * A positive value resists; a NEGATIVE value is a vulnerability.
 */
export const RES_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['Rfire', 'fire'],
  ['Rcold', 'cold'],
  ['Rpois', 'poison'],
  ['Relec', 'electric'],
  ['Revil', 'evil'],
  ['Racid', 'acid'],
] as const;

/**
 * Percent changed per resistance pip. Every reduction observed in real logs is
 * 100/6 %: 1 pip → 16.67%, 2 pips → 33.33%.
 */
export const PIP_PCT = 100 / 6;

/** A landed hit always does at least this much, however high the defender's AC. */
export const DAMAGE_FLOOR = 1;

/** Moves an entity regains per turn. Attack Speed is measured against this. */
export const MOVES_PER_TURN = 1;
