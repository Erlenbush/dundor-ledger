import type { LoadedFight } from '../types.js';

export interface FightListProps {
  items: LoadedFight[];
  current: number;
  onSelect: (index: number) => void;
}

/** Switcher across every log loaded. Hidden until there is more than one. */
export function FightList({ items, current, onSelect }: FightListProps) {
  if (items.length < 2) return null;
  return (
    <section>
      <p className="eyebrow">Loaded fights</p>
      <div className="panel fightlist">
        {items.map((it, i) => {
          if ('error' in it) {
            return (
              <button key={i} type="button" className="frow" disabled aria-current="false">
                <span className="idx">{i + 1}</span>
                <span className="nm">{it.label}</span>
                <span className="det">{it.error}</span>
                <span className="chip e">Skipped</span>
              </button>
            );
          }
          const { fight, analysis } = it;
          const won = fight.outcome.winner === analysis.player;
          return (
            <button
              key={i}
              type="button"
              className="frow"
              aria-current={i === current}
              onClick={() => onSelect(i)}
            >
              <span className="idx">{i + 1}</span>
              <span className="nm">vs <span className="op">{analysis.monster}</span></span>
              <span className="det">
                {analysis.totalTurns} turns · {analysis.stats[analysis.player]!.dealt} dealt ·{' '}
                {analysis.playerMitigation.taken} taken
              </span>
              <span className={`chip ${won ? 'w' : 'l'}`}>{won ? 'Win' : 'Loss'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
