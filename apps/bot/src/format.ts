import type { ExportedFight, Severity } from '@dundor/parser';

/**
 * Shape a parsed fight into a Discord embed. Pure data in, pure data out, so
 * this is testable and dry-runnable without a Discord connection.
 *
 * Every insight carries a `headline` and a `body`, and the body is where the
 * derived numbers live: the mitigation chain behind a killing blow, the split
 * behind a damage mix, how far off a fair run the dice were. Detailed mode
 * gives each insight its own field so none of that is thrown away. Compact
 * mode falls back to headlines, for when several fights share one reply and
 * the full text would be a wall.
 */
export interface FightEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footer: string;
}

const GREEN = 0x1f7a4d;
const RED = 0xb03a28;

/**
 * Findings you can act on come before findings you cannot. `good` sits above
 * `note` because it still describes a choice you made, where notes are mostly
 * luck.
 */
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, good: 2, note: 3 };
const SEVERITY_MARK: Record<Severity, string> = {
  critical: '🔴',
  warning: '🟠',
  good: '🟢',
  note: '⚪',
};

// Discord's own ceilings. Bodies run about 300 characters today, so these are
// guards against a future insight growing rather than limits we expect to hit.
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;
const STAT_FIELDS = 3;
const HEADLINES_WHEN_COMPACT = 3;

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;

const clamp = (s: string, limit = FIELD_VALUE_LIMIT): string =>
  s.length <= limit ? s : `${s.slice(0, limit - 1)}…`;

export function formatFight(entry: ExportedFight, detailed = true): FightEmbed {
  const { fight, analysis: a, insights } = entry;
  const won = fight.outcome.winner === a.player;
  const me = a.stats[a.player]!;
  const mit = a.playerMitigation;
  const luck = a.luck[a.player]!;

  const lines = [
    `**${a.player}** vs **${a.monster}**, ${a.totalTurns} turns.`,
    won
      ? `Won with ${a.finalPlayerHp}/${fight.maxHp[a.player]} HP left.`
      : `Lost at ${a.finalPlayerHp}/${fight.maxHp[a.player]} HP.`,
  ];

  const ranked = [...insights].sort(
    (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity],
  );

  const insightFields = detailed
    ? ranked.slice(0, MAX_FIELDS - STAT_FIELDS).map((i) => ({
        name: `${SEVERITY_MARK[i.severity]} ${i.tag}`,
        value: clamp(`${i.headline}\n${i.body}`),
        inline: false,
      }))
    : [];

  const headlines = detailed
    ? []
    : ranked.slice(0, HEADLINES_WHEN_COMPACT).map((i) => `**${i.tag}:** ${i.headline}`);

  return {
    title: `${won ? 'Victory' : 'Defeat'}: ${a.player} vs ${a.monster}`,
    description: [...lines, ...(headlines.length ? ['', ...headlines] : [])].join('\n'),
    color: won ? GREEN : RED,
    fields: [
      ...insightFields,
      { name: 'Damage', value: `${me.dealt} dealt / ${mit.taken} taken`, inline: true },
      { name: 'Mitigated', value: pct(mit.pct), inline: true },
      {
        name: 'Hit rate',
        value:
          a.playerHitRate == null
            ? 'no swings'
            : `${me.hits}/${me.attacks} (expected ${luck.expectedHits})`,
        inline: true,
      },
    ],
    footer: `${a.events} events parsed from ${entry.source}`,
  };
}
