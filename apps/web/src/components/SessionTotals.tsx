import { summarize } from '@dundor/parser';
import type { OkFight } from '../types.js';
import { pct, plural } from '../format.js';
import { Tile } from './Tile.js';

/** Totals across every successfully parsed log. Hidden below two fights. */
export function SessionTotals({ items }: { items: OkFight[] }) {
  if (items.length < 2) return null;
  const s = summarize(items);
  const perFight = (n: number) => `${Math.round(n / s.fights)} per fight`;

  return (
    <section>
      <p className="eyebrow">Across all loaded fights</p>
      <h2 className="title">Session totals</h2>
      <div className="tiles">
        <Tile label="Fights" value={s.fights} sub={`${s.wins} won · ${s.losses} lost`}
              meterPct={(s.wins / s.fights) * 100} meterColor="var(--good)" />
        <Tile label="Total dealt" value={s.dealt} sub={perFight(s.dealt)} />
        <Tile label="Total taken" value={s.taken}
              sub={s.incomingRaw ? `${pct(s.absorbedPct)} of ${s.incomingRaw} rolled was absorbed` : undefined}
              meterPct={s.absorbedPct} meterColor="var(--good)" />
        <Tile label="Hit rate" value={s.hitRate == null ? '—' : pct(s.hitRate)}
              sub={`${s.hits} of ${plural(s.swings, 'swing')}`}
              meterPct={s.hitRate ?? 0} meterColor="var(--s1)" />
        <Tile label="Turns spent" value={s.turns} sub={perFight(s.turns)} />
        <Tile label="Spent walking" value={pct((s.approachTurns / Math.max(1, s.turns)) * 100)}
              sub={`${s.approachTurns} of ${s.turns} turns before contact`}
              meterPct={(s.approachTurns / Math.max(1, s.turns)) * 100} meterColor="var(--ink-3)" />
        <Tile label="Turns stalled" value={s.stalls} sub="attack speed exceeded moves banked"
              meterPct={(s.stalls / Math.max(1, s.turns)) * 100} meterColor="var(--warn)" />
        <Tile label="Overkill" value={s.overkill}
              sub={s.dealt ? `${pct((s.overkill / s.dealt) * 100)} of output wasted` : undefined}
              meterPct={(s.overkill / Math.max(1, s.dealt)) * 100} meterColor="var(--warn)" />
      </div>
    </section>
  );
}
