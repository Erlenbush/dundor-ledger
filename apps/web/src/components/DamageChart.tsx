import { useMemo, useRef, useState } from 'react';
import type { OkFight } from '../types.js';

interface Hover {
  turn: number;
  x: number;
  player: number;
  monster: number;
}

/**
 * Post-mitigation damage per turn, one pair of bars per logged turn. The HP
 * chart shows where the fight went; this shows when it moved. Colour follows
 * the actor, matching the HP lines: blue is the player's output, orange the
 * monster's.
 */
export function DamageChart({ item }: { item: OkFight }) {
  const { analysis: a } = item;
  const P = a.player;
  const M = a.monster;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const data = a.turnDamage;
  const any = data.some((t) => (t.dealt[P] ?? 0) > 0 || (t.dealt[M] ?? 0) > 0);

  const geom = useMemo(() => {
    if (!any || data.length < 2) return null;
    const W = 900;
    const H = 170;
    const ml = 44;
    const mr = 74;
    // Headroom for the peak labels drawn above the tallest bars.
    const mt = 22;
    const mb = 30;
    const iw = W - ml - mr;
    const ih = H - mt - mb;

    const xMax = Math.max(...data.map((t) => t.turn));
    const yMax = Math.max(...data.map((t) => Math.max(t.dealt[P] ?? 0, t.dealt[M] ?? 0)), 1);

    // The x scale matches the HP chart so the two read as one timeline.
    const X = (t: number) => ml + (t / (xMax || 1)) * iw;
    const Y = (v: number) => mt + ih - (v / yMax) * ih;
    // Bar width scales with turn density, capped so sparse fights stay slim.
    const bw = Math.min(9, Math.max(3, (iw / (xMax + 1)) * 0.28));

    const step = yMax > 200 ? 100 : yMax > 60 ? 50 : 20;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += step) yTicks.push(v);
    const xTicks = data.map((t) => t.turn).filter((t) => t === xMax || (t % 4 === 0 && xMax - t > 2));

    return { W, H, ml, mt, iw, ih, xMax, yMax, X, Y, bw, yTicks, xTicks };
  }, [data, any, P, M]);

  if (!geom) return null;
  const { W, H, ml, mt, iw, ih, X, Y, bw, yTicks, xTicks } = geom;

  // Direct-label the biggest hit on each side; everything else stays quiet.
  const peakOf = (who: string) =>
    data.reduce((best, t) => ((t.dealt[who] ?? 0) > (best.dealt[who] ?? 0) ? t : best), data[0]!);
  const peaks = { [P]: peakOf(P), [M]: peakOf(M) };

  // A landed hit floored to 1 would render at a fraction of a pixel. Give any
  // nonzero value a visible sliver so floor hits stay findable.
  const barTop = (v: number) => (v > 0 ? Math.min(Y(v), mt + ih - 2) : mt + ih);

  const onMove = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((clientX - box.left) / box.width) * W;
    const raw = ((sx - ml) / iw) * geom.xMax;
    let best = data[0]!;
    for (const t of data) if (Math.abs(t.turn - raw) < Math.abs(best.turn - raw)) best = t;
    setHover({ turn: best.turn, x: X(best.turn), player: best.dealt[P] ?? 0, monster: best.dealt[M] ?? 0 });
  };

  return (
    <section>
      <p className="eyebrow">Damage</p>
      <h2 className="title">Who hurt whom, turn by turn</h2>
      <div className="panel chartwrap">
        <div className="legend">
          <span className="item"><span className="swatch" style={{ background: 'var(--s1)' }} />{P} dealt</span>
          <span className="item"><span className="swatch" style={{ background: 'var(--s2)' }} />{M} dealt</span>
        </div>
        <div className="chart-scroll">
          <svg
            ref={svgRef}
            className="hp"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Damage dealt per turn by ${P} and ${M}. Values are in the data table under the hit point chart.`}
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line className={v === 0 ? 'zeroline' : 'gridline'} x1={ml} y1={Y(v)} x2={ml + iw} y2={Y(v)} />
                <text className="tick" x={ml - 8} y={Y(v) + 3.5} textAnchor="end">{v}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick" x={X(t)} y={mt + ih + 16} textAnchor="middle">{t}</text>
            ))}

            {data.map((t) => {
              const pv = t.dealt[P] ?? 0;
              const mv = t.dealt[M] ?? 0;
              return (
                <g key={t.turn}>
                  {pv > 0 ? (
                    <rect x={X(t.turn) - bw - 1} y={barTop(pv)} width={bw}
                          height={mt + ih - barTop(pv)} rx={2} fill="var(--s1)" />
                  ) : null}
                  {mv > 0 ? (
                    <rect x={X(t.turn) + 1} y={barTop(mv)} width={bw}
                          height={mt + ih - barTop(mv)} rx={2} fill="var(--s2)" />
                  ) : null}
                  {peaks[P] === t && pv > 0 ? (
                    <text className="endlabel" fill="var(--s1)" x={X(t.turn) - bw / 2 - 1}
                          y={Math.max(barTop(pv) - 5, 12)} textAnchor="middle">{pv}</text>
                  ) : null}
                  {peaks[M] === t && mv > 0 ? (
                    <text className="endlabel" fill="var(--s2)" x={X(t.turn) + bw / 2 + 1}
                          y={Math.max(barTop(mv) - 5, 12)} textAnchor="middle">{mv}</text>
                  ) : null}
                </g>
              );
            })}

            {hover ? (
              <line className="crosshair" x1={hover.x} y1={mt} x2={hover.x} y2={mt + ih} />
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
          <div className="tipbox" style={{ left: `${(hover.x / W) * 100}%`, top: '18%' }}>
            <div className="tt">Turn {hover.turn}</div>
            <div className="tr"><i style={{ background: 'var(--s1)' }} />{P} dealt<b>{hover.player}</b></div>
            <div className="tr"><i style={{ background: 'var(--s2)' }} />{M} dealt<b>{hover.monster}</b></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
