import type { Analysis, Fight, Insight } from '@dundor/parser';

/** A log that parsed. */
export interface OkFight {
  label: string;
  fight: Fight;
  analysis: Analysis;
  insights: Insight[];
}

/** A log that did not parse. Kept in the list rather than dropped silently. */
export interface FailedFight {
  label: string;
  error: string;
}

export type LoadedFight = OkFight | FailedFight;

export const isOk = (f: LoadedFight): f is OkFight => !('error' in f);
