/**
 * Line patterns for Dundor's verbose fight log.
 *
 * Ordering matters when matching: `ac` must be tried before `roll`, because
 * "[x] rolls 140 for AC and reduces…" and "[x] rolls 46 for :punch: physical!"
 * both start the same way.
 *
 * Integer captures accept thousands separators: once a value crosses 1,000 the
 * log prints it as "2,205". Convert captures with a comma-stripping parser,
 * never with a bare Number().
 */
const INT = '-?[\\d,]+';

export const RE = {
  header: /^The fight happens between (.+?) and (.+?)!$/,
  statsFor: /^Stats for (.+?)\s*-{5,}\s*$/,
  logsHdr: /^Logs\s*-{5,}\s*$/,
  turn: /^TURN (\d+)\s*-{5,}\s*$/,
  dist: /^The distance between you is (\d+) tiles\.$/,
  first: /^\[(.+?)\] starts first because \[(.+?)\] hasn't noticed them yet\.$/,
  gains: new RegExp(
    `^\\[(.+?)\\] gains ([\\d.]+) moves\\. Moves left = ([\\d.]+)\\. ` +
    `HP left: (${INT})\\/(${INT})\\. Mana left: (${INT})\\/(${INT})\\.$`,
  ),
  move: /^\[(.+?)\] moves (\d+) spaces? closer to \[(.+?)\]\. Distance left = (\d+)\.$/,
  sneak: /^\[(.+?)\] sneaks (\d+) spaces? closer but alerts \[(.+?)\]! Distance left = (\d+)!?\.?/,
  uses: /^\[(.+?)\] uses ([\d.]+) moves! Moves left = ([\d.]+)\.$/,
  miss: /^\[(.+?)\] tries attacking in melee but misses! \[evade roll: ([\d.]+) <= ([\d.]+)\]/,
  hit: /^\[(.+?)\] hits \[(.+?)\] with a melee attack! Applying each damage\. \[evade roll: ([\d.]+) > ([\d.]+)\]\./,
  ac: new RegExp(
    `^\\[(.+?)\\] rolls (${INT}) for AC and reduces the damage by (${INT})! Damage Left = (${INT})$`,
  ),
  resist: new RegExp(
    `^\\[(.+?)\\] reduces the damage by ([\\d.]+)% because of their resistance to this element! Damage Left = (${INT})$`,
  ),
  roll: new RegExp(`^\\[(.+?)\\] rolls (${INT}) for :([\\w+-]+): (.+?)!$`),
  damaged: new RegExp(`^\\[(.+?)\\] gets damaged by (${INT}) damage! HP Left = (${INT})\\/(${INT})\\.$`),
  effect: /^\[(.+?)\] applied the on hit effect \[(.+?)\]!$/,
  dies: /^\[(.+?)\] dies!$/,
  wins: /^\[(.+?)\] wins the fight because \[(.+?)\] has died!$/,
  damageInfo: new RegExp(
    `DamageInfo\\(type=:([\\w+-]+):\\s*([^,]+),\\s*min_amount=(${INT}),\\s*max_amount=(${INT})\\)`,
    'g',
  ),
  /** Indented "Key: value" line inside a stat block. */
  statLine: /^\s*([A-Za-z][A-Za-z0-9 _]*?)\s*:\s*(.*)$/,
} as const;
