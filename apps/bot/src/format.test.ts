import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportFights, type ExportedFight, type Insight } from '@dundor/parser';
import { formatFight } from './format.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

/** The real Fungus Creature log, so the numbers under test are the real ones. */
const fungus = (): ExportedFight => {
  const [first] = exportFights(fixture('fungus-creature-loss-xl63.txt'), 'fungus.txt');
  if (first === undefined || 'error' in first) throw new Error('fixture failed to parse');
  return first;
};

const insight = (over: Partial<Insight>): Insight => ({
  id: 'x',
  severity: 'note',
  tag: 'Tag',
  headline: 'Headline.',
  body: 'Body.',
  ...over,
});

/** Minimal fight object covering only what formatFight reads. */
const synthetic = (insights: Insight[], won = false): ExportedFight =>
  ({
    source: 'synthetic.txt',
    fightIndex: 0,
    fight: { outcome: { winner: won ? 'me' : 'mob' }, maxHp: { me: 100 } },
    analysis: {
      player: 'me',
      monster: 'mob',
      totalTurns: 5,
      finalPlayerHp: won ? 40 : 0,
      events: 12,
      playerHitRate: 0.5,
      stats: { me: { dealt: 100, hits: 2, attacks: 4 } },
      playerMitigation: { taken: 60, pct: 12.5 },
      luck: { me: { expectedHits: 2 } },
    },
    insights,
  }) as unknown as ExportedFight;

/** Insight fields are the block ones, and are named "<mark> <tag>". */
const valueOf = (embed: ReturnType<typeof formatFight>, tag: string): string =>
  embed.fields.find((f) => !f.inline && f.name.endsWith(tag))?.value ?? '';

/** Stat fields are the inline ones, and are named exactly. "Damage" the stat
 *  and "Damage mix" the insight would otherwise collide. */
const statOf = (embed: ReturnType<typeof formatFight>, name: string): string =>
  embed.fields.find((f) => f.inline && f.name === name)?.value ?? '';

describe('formatFight, detailed', () => {
  it('surfaces the body of every insight, not just the headline', () => {
    const embed = formatFight(fungus(), true);
    // The mitigation chain lives in the killing blow body and was previously dropped.
    expect(valueOf(embed, 'Killing blow')).toContain('armour absorbed');
    expect(valueOf(embed, 'Accuracy')).toContain('94.7%');
  });

  it('keeps insights the old three-insight cap discarded', () => {
    const embed = formatFight(fungus(), true);
    // Dice and Damage mix were positions four and five, so they never appeared.
    expect(valueOf(embed, 'Dice')).toContain('32.84');
    expect(valueOf(embed, 'Damage mix')).toContain('821');
  });

  it('gives every insight its own field', () => {
    const entry = fungus();
    const embed = formatFight(entry, true);
    const insightFields = embed.fields.filter((f) => !f.inline);
    expect(insightFields).toHaveLength(entry.insights.length);
  });

  it('still reports the summary stats', () => {
    const embed = formatFight(fungus(), true);
    expect(statOf(embed, 'Damage')).toBe('916 dealt / 967 taken');
    expect(statOf(embed, 'Mitigated')).toBe('94.1%');
    expect(statOf(embed, 'Hit rate')).toContain('2/38');
  });

  it('orders actionable findings above luck', () => {
    const embed = formatFight(
      synthetic([
        insight({ id: 'a', severity: 'note', tag: 'Luck' }),
        insight({ id: 'b', severity: 'critical', tag: 'Fatal' }),
        insight({ id: 'c', severity: 'warning', tag: 'Warn' }),
        insight({ id: 'd', severity: 'good', tag: 'Nice' }),
      ]),
      true,
    );
    const order = embed.fields.filter((f) => !f.inline).map((f) => f.name);
    expect(order.map((n) => n.replace(/^\S+\s/, ''))).toEqual(['Fatal', 'Warn', 'Nice', 'Luck']);
  });

  it('marks severity on the field name', () => {
    const embed = formatFight(synthetic([insight({ severity: 'critical', tag: 'Fatal' })]), true);
    expect(embed.fields[0]!.name).toMatch(/Fatal$/);
    expect(embed.fields[0]!.name).not.toBe('Fatal');
  });

  it('keeps a field value inside Discord’s 1024 character limit', () => {
    const embed = formatFight(synthetic([insight({ body: 'x'.repeat(4000) })]), true);
    expect(embed.fields[0]!.value.length).toBeLessThanOrEqual(1024);
  });

  it('caps total fields so the 25 field limit cannot be breached', () => {
    const many = Array.from({ length: 40 }, (_, i) => insight({ id: `i${i}`, tag: `T${i}` }));
    const embed = formatFight(synthetic(many), true);
    expect(embed.fields.length).toBeLessThanOrEqual(25);
  });
});

describe('formatFight, compact', () => {
  it('shows headlines without bodies', () => {
    const embed = formatFight(fungus(), false);
    expect(embed.description).toContain('You landed 2 of 38 swings.');
    expect(embed.description).not.toContain('armour absorbed');
  });

  it('keeps only the summary stat fields', () => {
    const embed = formatFight(fungus(), false);
    expect(embed.fields.every((f) => f.inline)).toBe(true);
    expect(embed.fields).toHaveLength(3);
  });
});

describe('formatFight, shared behaviour', () => {
  it('titles and colours a defeat', () => {
    const embed = formatFight(fungus(), true);
    expect(embed.title).toBe('Defeat: food_ vs Fungus Creature');
    expect(embed.color).toBe(0xb03a28);
  });

  it('titles and colours a victory', () => {
    const embed = formatFight(synthetic([], true), true);
    expect(embed.title).toBe('Victory: me vs mob');
    expect(embed.color).toBe(0x1f7a4d);
    expect(embed.description).toContain('Won with 40/100 HP left.');
  });

  it('reports the source in the footer', () => {
    expect(formatFight(fungus(), true).footer).toContain('fungus.txt');
  });

  it('does not report 0% mitigation on a fight nothing was rolled at', () => {
    const [only] = exportFights(fixture('icecorn-xl63.txt'), 'icecorn.txt');
    if (only === undefined || 'error' in only) throw new Error('fixture failed to parse');
    expect(only.analysis.playerMitigation.incomingRaw).toBe(0);
    expect(statOf(formatFight(only, true), 'Mitigated')).toBe('nothing rolled at you');
  });

  it('still reports a real mitigation percentage when there is one', () => {
    expect(statOf(formatFight(fungus(), true), 'Mitigated')).toBe('94.1%');
  });

  it('handles a fight with no insights at all', () => {
    const embed = formatFight(synthetic([]), true);
    expect(embed.fields.filter((f) => !f.inline)).toHaveLength(0);
    expect(embed.fields).toHaveLength(3);
  });
});
