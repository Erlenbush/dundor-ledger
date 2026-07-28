/** Shared number/word formatting for the UI layer. */
export const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;
export const one = (n: number): string => String(Math.round(n * 10) / 10);
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "115/118", or just "115" when no maximum is known, or an em dash when neither is. */
export const hp = (value: number | null | undefined, max: number | null | undefined): string => {
  if (value == null) return '—';
  return Number.isFinite(max) ? `${value}/${max}` : String(value);
};
