// Generate apps/web/src/sample.ts from a real fixture, with every identifying
// field scrubbed.
//
// The sample is compiled into a publicly served bundle, so this runs as a build
// step rather than a manual edit, so regenerating the sample cannot quietly
// reintroduce personal data. It fails loudly if anything identifying survives.
//
//   npm run sample

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(root, 'fixtures', 'lava-golem-xl24.txt');
const TARGET = path.join(root, 'apps', 'web', 'src', 'sample.ts');

/**
 * Every field in a Dundor log that ties back to a real person.
 *
 * `Name` is the player's Discord username and `User Id` their snowflake. Both
 * resolve to the same live account. `God` is game content, but combined with a
 * full stat block it still fingerprints one character.
 */
const REDACTIONS = [
  { what: 'Discord snowflake', find: /(User Id:\s*)\d+/g, put: '$1000000000000000000', expect: 1 },
  { what: 'player name', find: /\bfood_/g, put: 'Adventurer', expect: null },
  { what: 'god', find: /\bStcafetra\b/g, put: 'Anonymous', expect: null },
];

let text = fs.readFileSync(SOURCE, 'utf8').replace(/\r/g, '').trimEnd();

for (const { what, find, put, expect } of REDACTIONS) {
  const hits = text.match(find)?.length ?? 0;
  if (hits === 0) throw new Error(`${what}: nothing matched. Has the log format changed?`);
  if (expect !== null && hits !== expect) {
    throw new Error(`${what}: expected ${expect} occurrence(s), found ${hits}`);
  }
  text = text.replace(find, put);
  console.log(`  scrubbed ${what} (${hits} occurrence${hits === 1 ? '' : 's'})`);
}

// Belt and braces: nothing identifying may survive, including any snowflake a
// future log format might introduce under a different key.
const FORBIDDEN = [/123369068005818368/, /\bfood_/, /\bStcafetra\b/];
for (const re of FORBIDDEN) {
  if (re.test(text)) throw new Error(`redaction failed: ${re} still present`);
}
const strays = [...new Set(text.match(/\b\d{17,19}\b/g) ?? [])].filter((s) => !/^0+$/.test(s));
if (strays.length) throw new Error(`unredacted long identifier(s): ${strays.join(', ')}`);

// The sample is emitted as a template literal.
if (text.includes('`') || text.includes('${')) {
  throw new Error('fixture contains characters that would break the template literal');
}

const CHECK = process.argv.includes('--check');

const banner = `// GENERATED FILE. Do not edit. Run \`npm run sample\` to rebuild.
//
// The XL 24 Lava Golem fight from fixtures/lava-golem-xl24.txt, with the player
// name, god and Discord user ID scrubbed. This file is compiled into the public
// bundle; the fixtures keep the real values for the parser tests.
//
// Combat numbers are untouched, so every derived figure still matches the
// original fight.
export const SAMPLE = \``;

const expected = `${banner}${text}\`;\n`;

// --check verifies the committed file still matches, so a hand-edit that
// reintroduces personal data fails the build instead of shipping.
if (CHECK) {
  const actual = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
  if (actual !== expected) {
    console.error(
      `\n${path.relative(root, TARGET)} is out of date or has been edited by hand.\n` +
      `Run \`npm run sample\` to regenerate it from the fixture.`,
    );
    process.exit(1);
  }
  console.log(`\n${path.relative(root, TARGET)} is clean. Nothing identifying ships.`);
} else {
  fs.writeFileSync(TARGET, expected);
  console.log(`\nwrote ${path.relative(root, TARGET)} (${text.length} chars)`);
}
