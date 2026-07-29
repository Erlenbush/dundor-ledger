/**
 * Line patterns for Dundor's verbose fight log.
 *
 * Ordering matters when matching: `ac` must be tried before `roll`, because
 * "[x] rolls 140 for AC and reduces…" and "[x] rolls 46 for :punch: physical!"
 * both start the same way.
 */
export const RE = {
  header: /^The fight happens between (.+?) and (.+?)!$/,
  statsFor: /^Stats for (.+?)\s*-{5,}\s*$/,
  logsHdr: /^Logs\s*-{5,}\s*$/,
  turn: /^TURN (\d+)\s*-{5,}\s*$/,
  dist: /^The distance between you is (\d+) tiles\.$/,
  first: /^\[(.+?)\] starts first because \[(.+?)\] hasn't noticed them yet\.$/,
  gains: /^\[(.+?)\] gains ([\d.]+) moves\. Moves left = ([\d.]+)\. HP left: (-?\d+)\/(\d+)\. Mana left: (-?\d+)\/(\d+)\.$/,
  move: /^\[(.+?)\] moves (\d+) spaces? closer to \[(.+?)\]\. Distance left = (\d+)\.$/,
  sneak: /^\[(.+?)\] sneaks (\d+) spaces? closer but alerts \[(.+?)\]! Distance left = (\d+)!?\.?/,
  uses: /^\[(.+?)\] uses ([\d.]+) moves! Moves left = ([\d.]+)\.$/,
  miss: /^\[(.+?)\] tries attacking in melee but misses! \[evade roll: ([\d.]+) <= ([\d.]+)\]/,
  hit: /^\[(.+?)\] hits \[(.+?)\] with a melee attack! Applying each damage\. \[evade roll: ([\d.]+) > ([\d.]+)\]\./,
  ac: /^\[(.+?)\] rolls (\d+) for AC and reduces the damage by (\d+)! Damage Left = (-?\d+)$/,
  resist: /^\[(.+?)\] reduces the damage by ([\d.]+)% because of their resistance to this element! Damage Left = (-?\d+)$/,
  roll: /^\[(.+?)\] rolls (\d+) for :([\w+-]+): (.+?)!$/,
  damaged: /^\[(.+?)\] gets damaged by (\d+) damage! HP Left = (-?\d+)\/(\d+)\.$/,
  effect: /^\[(.+?)\] applied the on hit effect \[(.+?)\]!$/,
  dies: /^\[(.+?)\] dies!$/,
  wins: /^\[(.+?)\] wins the fight because \[(.+?)\] has died!$/,
  damageInfo: /DamageInfo\(type=:([\w+-]+):\s*([^,]+),\s*min_amount=(-?\d+),\s*max_amount=(-?\d+)\)/g,
  /** Indented "Key: value" line inside a stat block. */
  statLine: /^\s*([A-Za-z][A-Za-z0-9 _]*?)\s*:\s*(.*)$/,
} as const;
