import { analyze } from './analyze.js';
import { deriveInsights } from './insights.js';
import { parseFight, splitLogs } from './parse.js';
import type { Analysis, Fight, Insight } from './types.js';

export interface ExportedFight {
  /** Where the text came from, usually a filename. */
  source: string;
  /** Zero-based position within the source when it held several fights. */
  fightIndex: number;
  fight: Fight;
  analysis: Analysis;
  insights: Insight[];
}

export interface ExportedError {
  source: string;
  fightIndex: number;
  error: string;
}

export type ExportResult = ExportedFight | ExportedError;

/**
 * Parse a source that may hold several fights and return everything the app
 * knows about each one, as plain data ready for JSON. Unparseable chunks come
 * back as error entries rather than throwing, so one bad section in a batch
 * does not sink the rest.
 *
 * This is the bridge for analysis outside JavaScript: dump these objects with
 * JSON.stringify and load them in Python, a spreadsheet, or anything else.
 */
export function exportFights(text: string, source = 'input'): ExportResult[] {
  return splitLogs(text).map((chunk, fightIndex) => {
    try {
      const fight = parseFight(chunk);
      const analysis = analyze(fight);
      return { source, fightIndex, fight, analysis, insights: deriveInsights(fight, analysis) };
    } catch (err) {
      return { source, fightIndex, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
