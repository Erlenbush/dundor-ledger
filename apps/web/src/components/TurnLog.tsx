import { Fragment, type ReactNode } from 'react';
import { isFloored, type Beat, type DamageInstance, type Turn } from '@dundor/parser';
import type { OkFight } from '../types.js';
import { one } from '../format.js';

interface Group {
  walk: boolean;
  turns: Turn[];
  entering: number | null;
}

const walkOnly = (t: Turn): boolean => {
  const kinds = new Set(t.beats.map((b) => b.t));
  kinds.delete('gains');
  kinds.delete('uses');
  return kinds.size === 1 && kinds.has('move');
};

export function TurnLog({ item }: { item: OkFight }) {
  const { fight, analysis: a } = item;
  const side = (who: string) => (who === a.player ? 'p' : 'm');
  const Actor = ({ who }: { who: string }) => <span className={`actor ${side(who)}`}>{who}</span>;

  const live = fight.turns.filter((t) => t.n);

  // Runs of pure walking are noise. Six rows of "closes to N tiles" bury the
  // turns that mattered, so fold each run into one row.
  const groups: Group[] = [];
  let distance = fight.startDistance;
  for (const t of live) {
    const entering = distance;
    for (const b of t.beats) if (b.t === 'move' || b.t === 'sneak') distance = b.distance;
    const prev = groups[groups.length - 1];
    if (walkOnly(t) && prev?.walk) prev.turns.push(t);
    else groups.push({ walk: walkOnly(t), turns: [t], entering });
  }

  return (
    <section>
      <p className="eyebrow">Turn log</p>
      <h2 className="title">The play by play</h2>
      <div className="panel turnlog">
        {groups.map((g, gi) => {
          if (g.walk && g.turns.length > 1) {
            const first = g.turns[0]!;
            const last = g.turns[g.turns.length - 1]!;
            const to = [...last.beats].reverse().find((b) => b.t === 'move');
            const movers = [...new Set(
              g.turns.flatMap((t) => t.beats.filter((b) => b.t === 'move').map((b) => b.who)),
            )];
            return (
              <div className="turn idle" key={`walk-${gi}`}>
                <div className="gutter"><span className="stripe" /><span className="tn">T{first.n}–{last.n}</span></div>
                <div className="beats">
                  <div className="beat quiet">
                    {movers.map((w, i) => (
                      <Fragment key={w}>{i ? ' and ' : ''}<Actor who={w} /></Fragment>
                    ))}{' '}
                    trade steps for <b>{g.turns.length} turns</b>, closing from {g.entering} tiles to{' '}
                    {to && to.t === 'move' ? to.distance : 0}. No attacks possible.
                  </div>
                </div>
              </div>
            );
          }
          return <TurnRow key={g.turns[0]!.n} turn={g.turns[0]!} item={item} />;
        })}
      </div>
    </section>
  );
}

function TurnRow({ turn, item }: { turn: Turn; item: OkFight }) {
  const { analysis: a } = item;
  const side = (who: string) => (who === a.player ? 'p' : 'm');
  const Actor = ({ who }: { who: string }) => <span className={`actor ${side(who)}`}>{who}</span>;

  const spent = turn.beats.some((b) => b.t === 'uses');
  const isKill = turn.beats.some((b) => b.t === 'dies' || b.t === 'wins');
  const lead = turn.beats.find((b) => 'who' in b) as Extract<Beat, { who: string }> | undefined;

  // A turn landing physical AND fire logs two "gets damaged" lines. Show one HP
  // bar per victim: the state at the end of the turn, not one per instance.
  const lastDamaged = new Map<string, number>();
  turn.beats.forEach((b, i) => { if (b.t === 'damaged') lastDamaged.set(b.who, i); });

  const rows: ReactNode[] = [];
  turn.beats.forEach((b, bi) => {
    switch (b.t) {
      case 'sneak':
        rows.push(
          <div className="beat head" key={bi}>
            <Actor who={b.who} /> sneaks {b.spaces} closer and <b>alerts it</b>. {b.distance} tiles left.
          </div>,
        );
        break;
      case 'move':
        rows.push(
          <div className="beat" key={bi}>
            <Actor who={b.who} /> closes to {b.distance} tile{b.distance === 1 ? '' : 's'}.
          </div>,
        );
        break;
      case 'miss': {
        const margin = b.threshold - b.roll;
        rows.push(
          <div className="beat head" key={bi}>
            <Actor who={b.who} /> swings and <b>misses</b>
            <span className={`roll${margin < 2 ? ' thin' : ''}`}>
              evade {b.roll.toFixed(2)} ≤ {b.threshold.toFixed(2)}
              {margin < 2 ? ` · by ${one(margin)}` : ''}
            </span>
          </div>,
        );
        break;
      }
      case 'hit':
        rows.push(
          <div className="beat head" key={bi}>
            <Actor who={b.who} /> connects
            <span className="roll">evade {b.roll.toFixed(2)} &gt; {b.threshold.toFixed(2)}</span>
          </div>,
        );
        b.damages.forEach((d, di) => rows.push(<DamageRow key={`${bi}-${di}`} d={d} />));
        break;
      case 'damaged': {
        if (lastDamaged.get(b.who) !== bi) break;
        const frac = b.hpMax ? Math.max(0, b.hp) / b.hpMax : 0;
        rows.push(
          <div className="beat hpafter" key={bi}>
            <Actor who={b.who} />
            <span className="hpbar">
              <i style={{ width: `${(frac * 100).toFixed(1)}%`, background: `var(--s${b.who === a.player ? 1 : 2})` }} />
            </span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{b.hp}/{b.hpMax} HP</span>
          </div>,
        );
        break;
      }
      case 'effect':
        rows.push(
          <div className="beat" key={bi}>
            <Actor who={b.who} /> procs <span className="effect">{b.effect}</span>
          </div>,
        );
        break;
      case 'dies':
        rows.push(
          <div className="beat head" style={{ color: 'var(--crit)', fontWeight: 700 }} key={bi}>
            <Actor who={b.who} /> dies.
          </div>,
        );
        break;
      case 'wins':
        rows.push(
          <div className="beat head" style={{ color: 'var(--good)', fontWeight: 700 }} key={bi}>
            <Actor who={b.who} /> wins the fight.
          </div>,
        );
        break;
      case 'raw':
        rows.push(<div className="beat quiet" key={bi}>{b.text}</div>);
        break;
      default:
        break;
    }
  });

  if (!spent) {
    const gained = turn.beats.find((b) => b.t === 'gains');
    const stall = Object.values(a.stalled).flat().find((s) => s.turn === turn.n);
    if (gained && gained.t === 'gains') {
      rows.push(
        <div className="beat quiet" key="stall">
          <Actor who={gained.who} /> banks moves, holding {one(gained.movesLeft ?? 0)}
          {stall?.need != null ? `, an attack costs ${one(stall.need)}.` : '.'}
          {stall?.short != null && stall.short > 0 ? (
            <> <b style={{ color: 'var(--warn)' }}>Short {one(stall.short)}. Turn wasted.</b></>
          ) : null}
        </div>,
      );
    }
  }

  return (
    <div className={`turn${!spent ? ' idle' : ''}${isKill ? ' kill' : ''}`}>
      <div className={`gutter ${lead ? side(lead.who) : ''}`}>
        <span className="stripe" />
        <span className="tn">T{turn.n}</span>
      </div>
      <div className="beats">{rows}</div>
    </div>
  );
}

/**
 * The mitigation chain for one damage instance. Where AC swallowed the hit
 * entirely we print what actually happened rather than the log's stated cut.
 * An AC roll of 140 against a 24-damage hit absorbs 24, not 140.
 */
function DamageRow({ d }: { d: DamageInstance }) {
  const preAc = d.afterResist ?? d.raw;
  const floored = isFloored(d);
  return (
    <div className={`dmg ${d.type}`}>
      <span className="type">{d.type}</span>
      <span className="chain">
        <span>roll <b style={{ color: 'var(--ink)' }}>{d.raw}</b></span>
        {d.resistPct != null ? (
          <><span className="sep">·</span><span className="cut">−{one(d.resistPct)}% resist → {d.afterResist}</span></>
        ) : null}
        {d.acCut != null ? (
          <>
            <span className="sep">·</span>
            {floored ? (
              <>
                <span className="cut">AC roll {d.acRoll} swallows all {preAc}</span>
                <span className="sep">·</span>
                <span className="floor">floored to 1</span>
              </>
            ) : (
              <span className="cut">−{d.acCut} AC (roll {d.acRoll})</span>
            )}
          </>
        ) : null}
      </span>
      <span className="out">{d.dealt ?? 0} dealt</span>
    </div>
  );
}
