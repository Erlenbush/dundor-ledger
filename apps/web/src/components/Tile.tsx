import type { ReactNode } from 'react';

export interface TileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  meterPct?: number;
  meterColor?: string;
}

/** One stat cell. `meterPct` draws a thin proportion bar beneath the number. */
export function Tile({ label, value, sub, meterPct, meterColor }: TileProps) {
  return (
    <div className="tile">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      {sub ? <span className="s">{sub}</span> : null}
      {meterPct != null ? (
        <span className="meter">
          <i style={{ width: `${Math.max(0, Math.min(100, meterPct))}%`, background: meterColor }} />
        </span>
      ) : null}
    </div>
  );
}
