import { PIP_PCT, RES_KEYS, type FightEntity } from '@dundor/parser';
import type { OkFight } from '../types.js';
import { cap } from '../format.js';

/** Rows to show, in order, with the label to show them under. */
const ROWS: ReadonlyArray<readonly [string, string]> = [
  ['Hp', 'Hit points'], ['Mana', 'Mana'], ['Ac', 'Armour (AC)'], ['Ev', 'Evasion (EV)'],
  ['Sh', 'Shield (SH)'], ['Attack Speed', 'Attack speed'], ['Melee Accuracy', 'Melee accuracy'],
  ['Xl', 'Level (XL)'], ['Str', 'Strength'], ['Dex', 'Dexterity'], ['Int', 'Intelligence'],
  ['God', 'God'], ['Resurrection', 'Resurrections'], ['Stab Multiplier', 'Stab multiplier'],
];

/** +1 where more is better, −1 where less is better. Absent = not comparable. */
const DIRECTION: Record<string, number> = {
  Hp: 1, Ac: 1, Ev: 1, Sh: 1, 'Melee Accuracy': 1, 'Attack Speed': -1,
};

export function StatBlocks({ item }: { item: OkFight }) {
  const { fight, analysis: a } = item;
  return (
    <section>
      <p className="eyebrow">Combatants</p>
      <h2 className="title">Stat blocks, with the gaps that mattered</h2>
      <div className="blocks">
        <Block e={fight.entities[a.player]!} other={fight.entities[a.monster]!} side="p" />
        <Block e={fight.entities[a.monster]!} other={fight.entities[a.player]!} side="m" />
      </div>
    </section>
  );
}

function Block({ e, other, side }: { e: FightEntity; other: FightEntity; side: 'p' | 'm' }) {
  const resists = RES_KEYS.filter(([k]) => Number(e.stats[k]) > 0);
  // Negative pips are vulnerabilities — the most actionable line in a monster's
  // block, so they get their own row rather than being filtered away.
  const vulns = RES_KEYS.filter(([k]) => Number(e.stats[k]) < 0);

  return (
    <div className={`panel block ${side}`}>
      <header>
        <span className="nm">{e.name}</span>
        <span className="sub">{e.kind === 'player' ? 'Player' : 'Monster'}</span>
      </header>

      <div className="kv">
        {e.damages.map((d) => (
          <Row key={d.type} label={`${cap(d.type)} damage`} value={`${d.min}–${d.max}`} />
        ))}
        {ROWS.filter(([k]) => e.stats[k] != null).map(([k, label]) => {
          const mine = Number.parseFloat(e.stats[k]!);
          const theirs = Number.parseFloat(other.stats[k] ?? '');
          const dir = DIRECTION[k];
          let cls = '';
          if (dir && Number.isFinite(mine) && Number.isFinite(theirs) && mine !== theirs) {
            cls = (mine > theirs) === dir > 0 ? 'adv' : 'dis';
          }
          return <Row key={k} label={label} value={e.stats[k]!} cls={cls} />;
        })}
      </div>

      {resists.length || vulns.length ? (
        <div className="resblock">
          {resists.length ? (
            <div className="rline">
              <span className="rk">Resists</span>
              <span className="rv">
                {resists.map(([k, name], i) => (
                  <span key={k}>
                    {i ? ' · ' : ''}{name} {e.stats[k]}{' '}
                    <span className="pctnote">(−{Math.round(Number(e.stats[k]) * PIP_PCT)}%)</span>
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {vulns.length ? (
            <div className="rline vuln">
              <span className="rk">Vulnerable to</span>
              <span className="rv">
                {vulns.map(([k, name], i) => (
                  <span key={k}>
                    {i ? ' · ' : ''}{name} {e.stats[k]}{' '}
                    (+{Math.round(Math.abs(Number(e.stats[k])) * PIP_PCT)}%)
                  </span>
                ))}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <>
      <div>{label}</div>
      <div className={cls}>{value}</div>
    </>
  );
}
