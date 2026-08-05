import type { ExportedFight } from '@dundor/parser';

/**
 * Shape a parsed fight into a Discord embed. Pure data in, pure data out, so
 * this is testable and dry-runnable without a Discord connection.
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

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;

export function formatFight(entry: ExportedFight): FightEmbed {
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

  // The top findings carry the coaching value; cap at three to stay readable.
  const reads = insights.slice(0, 3).map((i) => `**${i.tag}:** ${i.headline}`);

  return {
    title: `${won ? 'Victory' : 'Defeat'}: ${a.player} vs ${a.monster}`,
    description: [...lines, '', ...reads].join('\n'),
    color: won ? GREEN : RED,
    fields: [
      { name: 'Damage', value: `${me.dealt} dealt / ${mit.taken} taken`, inline: true },
      { name: 'Mitigated', value: pct(mit.pct), inline: true },
      {
        name: 'Hit rate',
        value: a.playerHitRate == null
          ? 'no swings'
          : `${me.hits}/${me.attacks} (expected ${luck.expectedHits})`,
        inline: true,
      },
    ],
    footer: `${a.events} events parsed from ${entry.source}`,
  };
}
