/**
 * Dry run: format a log file exactly as the bot would, without Discord.
 *
 *   npm run dry -w @dundor/bot -- fixtures/some-fight.txt
 */
import fs from 'node:fs';
import { exportFights } from '@dundor/parser';
import { formatFight } from './format.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: dry <log.txt>');
  process.exit(2);
}

for (const entry of exportFights(fs.readFileSync(file, 'utf8'), file)) {
  if ('error' in entry) {
    console.log(`ERROR: ${entry.error}`);
    continue;
  }
  const e = formatFight(entry);
  console.log(`\n=== ${e.title} ===`);
  console.log(e.description);
  for (const f of e.fields) console.log(`  ${f.name}: ${f.value}`);
  console.log(`  (${e.footer})`);
}
