#!/usr/bin/env node
/**
 * dundor-parse: convert Dundor .txt battle logs to JSON.
 *
 *   npx dundor-parse fixtures/*.txt > fights.json
 *   cat fight.txt | npx dundor-parse > fight.json
 *
 * Output is a JSON array with one entry per fight found. Each entry carries
 * the raw parsed fight, the derived analysis, and the insights, so downstream
 * tools (pandas, spreadsheets) never need to reimplement the parser. Sections
 * that fail to parse become { source, fightIndex, error } entries and are
 * counted on stderr; the exit code is 1 only when nothing parsed at all.
 *
 * This file is the only part of the package that touches Node APIs. The
 * library itself stays free of I/O so it can run in the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { exportFights, type ExportResult } from './export.js';

function usage(): never {
  process.stderr.write(
    'usage: dundor-parse [--compact] <log.txt> [more.txt ...]\n' +
    '       dundor-parse < log.txt\n',
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const compact = args.includes('--compact');
const files = args.filter((a) => !a.startsWith('--'));
if (args.some((a) => a.startsWith('--') && a !== '--compact')) usage();

const results: ExportResult[] = [];

if (files.length === 0) {
  if (process.stdin.isTTY) usage();
  const text = fs.readFileSync(0, 'utf8');
  results.push(...exportFights(text, 'stdin'));
} else {
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      results.push({
        source: path.basename(file),
        fightIndex: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    results.push(...exportFights(text, path.basename(file)));
  }
}

const ok = results.filter((r) => !('error' in r));
const bad = results.length - ok.length;

process.stdout.write(JSON.stringify(results, null, compact ? undefined : 2) + '\n');
process.stderr.write(`${ok.length} fight(s) parsed${bad ? `, ${bad} section(s) failed` : ''}\n`);
if (ok.length === 0) process.exit(1);
