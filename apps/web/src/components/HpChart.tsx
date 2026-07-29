import { useMemo, useRef, useState } from 'react';
import type { HpPoint } from '@dundor/parser';
import type { OkFight } from '../types.js';

interface Hover {
  turn: number;
  x: number;
  y: number;
  player: number;
  monster: number;
}

/**
 * Both combatants' hit points per turn on one shared y-axis. The two series are
 * the same measure in the same unit, so a second scale would be a lie.
 *
 * Series colours are validated categorical slots (blue / orange); identity is
 * carried by a legend AND direct end labels, never by colour alone.
 */
export function HpChart({ item }: { item: OkFight }) {
  const { fight, analysis: a } = item;
  const P = a.player;
  const M = a.monster;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Points whose HP could not be resolved (a log with no declared maximum)
  // are dropped rather than plotted as NaN.
  const finite = (pts: HpPoint[]) =>
    pts.filter((d): d is { turn: number; hp: number } => Number.isFinite(d.hp));
  const sP = useMemo(() => finite(a.series[P] ?? []), [a.series, P]);
  const sM = useMemo(() => finite(a.series[M] ?? []), [a.series, M]);

  const geom = useMemo(() => {
    if (sP.length < 2 || sM.length < 2) return null;
    const W = 900;
    const H = 280;
    const ml = 44;
    const mt = 16;
    const mb = 34;
    // Right margin must clear the longer direct label, or names get clipped.
    const mr = Math.max(74, 20 + Math.max(P.length, M.length) * 6.9);
    const iw = W - ml - mr;
    const ih = H - mt - mb;

    const turns = sP.map((d) => d.turn);
    const xMax = Math.max(...turns);
    const declared = [fight.maxHp[P], fight.maxHp[M]].filter((n): n is number => Number.isFinite(n));
    const yMax = Math.max(...sP.map((d) => d.hp), ...sM.map((d) => d.hp), ...declared);
    const yMin = Math.min(0, ...sP.map((d) => d.hp), ...sM.map((d) => d.hp));

    const X = (t: number) => ml + (t / (xMax || 1)) * iw;
    const Y = (v: number) => mt + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
    const path = (pts: Array<{ turn: number; hp: number }>) =>
      pts.map((d, i) => `${i ? 'L' : 'M'}${X(d.turn).toFixed(1)},${Y(d.hp).toFixed(1)}`).join('');

    const step = yMax > 100 ? 50 : 25;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(v);
    if (yMin < 0 && !yTicks.includes(0)) yTicks.unshift(0);
    // Drop a regular tick that would collide with the final one.
    const xTicks = turns.filter((t) => t === xMax || t === 0 || (t % 4 === 0 && xMax - t > 2));

    return { W, H, ml, mt, mb, mr, iw, ih, xMax, yMax, yMin, X, Y, path, yTicks, xTicks };
  }, [sP, sM, fight.maxHp, P, M]);

  if (!geom) {
    return (
      <section>
        <p className="eyebrow">Hit points</p>
        <div className="panel chartwrap">
          <p className="hint">
            Not enough hit-point data in this log to chart. The turn log below still has everything else.
          </p>
        </div>
      </section>
    );
  }

  const { W, H, ml, mt, iw, ih, xMax, X, Y, path, yTicks, xTicks } = geom;
  const engage = a.firstAttackTurn;
  const lastP = sP[sP.length - 1]!;
  const lastM = sM[sM.length - 1]!;

  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((clientX - box.left) / box.width) * W;
    const raw = ((sx - ml) / iw) * xMax;
    let best = sP[0]!;
    for (const d of sP) if (Math.abs(d.turn - raw) < Math.abs(best.turn - raw)) best = d;
    const dm = sM.find((d) => d.turn === best.turn);
    if (!dm) return;
    setHover({ turn: best.turn, x: X(best.turn), y: Math.min(Y(best.hp), Y(dm.hp)), player: best.hp, monster: dm.hp });
  };

  return (
    <section>
      <p className="eyebrow">Hit points</p>
      <h2 className="title">Both health bars, turn by turn</h2>
      <div className="panel chartwrap">
        <div className="legend">
          <span className="item">
            <span className="swatch" style={{ background: 'var(--s1)' }} />
            {P}{Number.isFinite(fight.maxHp[P]) ? ` (max ${fight.maxHp[P]} HP)` : ''}
          </span>
          <span className="item">
            <span className="swatch" style={{ background: 'var(--s2)' }} />
            {M}{Number.isFinite(fight.maxHp[M]) ? ` (max ${fight.maxHp[M]} HP)` : ''}
          </span>
          {engage ? (
            <span className="item">
              <span className="phase" style={{ background: 'var(--rule-soft)' }} />
              Approach (no attacks possible)
            </span>
          ) : null}
        </div>

        <div className="chart-scroll">
          <svg
            ref={svgRef}
            className="hp"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Hit points per turn for ${P} and ${M} over ${a.totalTurns} turns. Full values in the data table below.`}
          >
            {engage ? (
              <>
                <rect x={ml} y={mt} width={Math.max(0, X(engage) - ml)} height={ih}
                      fill="var(--rule-soft)" opacity={0.55} />
                <text className="axis-label" x={ml + 7} y={mt + ih - 9}>Approach</text>
                <text className="axis-label" x={X(engage) + 7} y={mt + ih - 9}>Engagement</text>
                <line className="zeroline" x1={X(engage)} y1={mt} x2={X(engage)} y2={mt + ih} />
              </>
            ) : null}

            {yTicks.map((v) => (
              <g key={v}>
                <line className={v === 0 ? 'zeroline' : 'gridline'} x1={ml} y1={Y(v)} x2={ml + iw} y2={Y(v)} />
                <text className="tick" x={ml - 8} y={Y(v) + 3.5} textAnchor="end">{v}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick" x={X(t)} y={mt + ih + 18} textAnchor="middle">{t}</text>
            ))}
            <text className="axis-label" x={ml + iw / 2} y={H - 3} textAnchor="middle">Turn</text>

            <path d={path(sP)} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(sM)} fill="none" stroke="var(--s2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            <circle cx={X(lastP.turn)} cy={Y(lastP.hp)} r={4.5} fill="var(--s1)" stroke="var(--panel)" strokeWidth={2} />
            <circle cx={X(lastM.turn)} cy={Y(lastM.hp)} r={4.5} fill="var(--s2)" stroke="var(--panel)" strokeWidth={2} />
            <text className="endlabel" fill="var(--s1)" x={X(lastP.turn) + 10} y={Y(lastP.hp) + 4}>{P}</text>
            <text className="endlabel" fill="var(--s2)" x={X(lastM.turn) + 10} y={Y(lastM.hp) + 4}>{M}</text>

            {hover ? (
              <>
                <line className="crosshair" x1={hover.x} y1={mt} x2={hover.x} y2={mt + ih} />
                <circle cx={hover.x} cy={Y(hover.player)} r={5} fill="var(--s1)" stroke="var(--panel)" strokeWidth={2} />
                <circle cx={hover.x} cy={Y(hover.monster)} r={5} fill="var(--s2)" stroke="var(--panel)" strokeWidth={2} />
              </>
            ) : null}

            <rect
              x={ml} y={mt} width={iw} height={ih} fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseMove={(e) => onMove(e.clientX)}
              onMouseLeave={() => setHover(null)}
              onTouchMove={(e) => { const t = e.touches[0]; if (t) onMove(t.clientX); }}
              onTouchEnd={() => setHover(null)}
            />
          </svg>
        </div>

        {hover ? (
          <div className="tipbox" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>
            <div className="tt">{hover.turn === 0 ? 'Fight start' : `Turn ${hover.turn}`}</div>
            <div className="tr">
              <i style={{ background: 'var(--s1)' }} />{P}<b>{hover.player}/{fight.maxHp[P]}</b>
            </div>
            <div className="tr">
              <i style={{ background: 'var(--s2)' }} />{M}<b>{hover.monster}/{fight.maxHp[M]}</b>
            </div>
          </div>
        ) : null}

        {/* Relief for the light-mode contrast warning on the orange series, and
            the non-visual route to the same numbers. */}
        <details className="disclose">
          <summary>Data table</summary>
          <div className="tbl-scroll">
            <table className="data">
              <thead>
                <tr><th>Turn</th><th>{P} HP</th><th>{M} HP</th><th>Phase</th></tr>
              </thead>
              <tbody>
                {sP.map((d, i) => (
                  <tr key={d.turn}>
                    <td>{d.turn || '—'}</td>
                    <td>{d.hp}</td>
                    <td>{sM[i]?.hp ?? '—'}</td>
                    <td>{d.turn === 0 ? 'start' : engage && d.turn < engage ? 'approach' : 'engagement'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
