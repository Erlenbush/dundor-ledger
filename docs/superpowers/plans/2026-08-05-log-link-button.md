# Log Link Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a link button on the bot's embed that opens the same fight in the browser UI, carrying the log inside the URL fragment so nothing is stored anywhere.

**Architecture:** The bot gzips the raw log text, base64url-encodes it behind a `g1.` scheme tag, and hangs it off a Discord link button as `https://<host>/#log=g1.<data>`. Fragments are never transmitted, so the log reaches neither Cloudflare nor any access log. The web app reads the fragment on mount, decompresses with the native `DecompressionStream`, and feeds the text into the ingest path it already has. Both sides re-parse with the same `@dundor/parser`, so they cannot disagree.

**Tech Stack:** TypeScript, Node 22, discord.js 14, React 18, Vite, vitest, Node `zlib` (bot) and `DecompressionStream` (browser).

**Spec:** `docs/superpowers/specs/2026-08-05-log-link-design.md`
**Manual steps:** `docs/manual/log-link-manual.md`

## Global Constraints

- **Never persist a log.** No disk, no KV, no R2, no server-side logging of log content. This was promised to the Dundor developer.
- **The fragment, not the query string.** Log data goes after `#`. A query string would be transmitted and logged.
- **Ships dark.** With `LEDGER_WEB_URL` unset there is no button and behaviour is byte-identical to today.
- **Never lose the analysis.** If Discord rejects a payload carrying components, retry once without them. A miscalibrated budget costs a button, never a reply.
- **Every failure lands on the working app.** No blank page, no dead end. The drop zone must be visible in every web error path.
- **Match existing style.** Embeds and components are passed as raw JSON objects, not builders. Pure logic lives in its own module with colocated `*.test.ts`, excluded from build via `src/**/*.test.ts`.
- **Node's `gzipSync` is deterministic** (verified), but contract pinning asserts *decoded output*, not byte equality, so it does not break on another platform.

---

### Task 1: Bot-side log encoding

**Files:**
- Create: `apps/bot/src/link.ts`
- Create: `apps/bot/src/link.test.ts`
- Create: `fixtures/link-contract.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `encodeLog(text: string): string` returning `"g1.<base64url>"`; `logUrl(base: string, text: string): { url: string; full: boolean }`; `MAX_LINK_CHARS: number`; `SCHEME: string`.

- [ ] **Step 1: Write the failing test**

Create `apps/bot/src/link.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodeLog, logUrl, MAX_LINK_CHARS, SCHEME } from './link.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const decode = (encoded: string): string =>
  gunzipSync(Buffer.from(encoded.slice(SCHEME.length + 1), 'base64url')).toString('utf8');

/**
 * Deterministic incompressible filler.
 *
 * `'x'.repeat(n)` will not do: 150,000 of one character gzips to 243
 * characters, so an "over budget" case built that way is comfortably under
 * budget and the test silently proves the opposite of what it claims.
 *
 * `Math.imul` keeps the multiply in 32 bits. A plain `seed * 1103515245`
 * exceeds JavaScript's safe integer range, loses precision and collapses into
 * a short cycle, which compresses well and reintroduces the same bug quietly.
 */
const noise = (length: number): string => {
  let seed = 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    seed = Math.imul(seed, 48271) % 2147483647;
    out += String.fromCharCode(33 + (seed % 94));
  }
  return out;
};

describe('encodeLog', () => {
  it('round-trips a real log through gzip', () => {
    const log = fixture('snake-xl100.txt');
    expect(decode(encodeLog(log))).toBe(log);
  });

  it('tags the payload with the scheme so the format can change later', () => {
    expect(encodeLog('anything')).toMatch(/^g1\./);
  });

  it('produces only characters that are safe in a URL fragment', () => {
    const encoded = encodeLog(fixture('fungus-creature-loss-xl63.txt'));
    expect(encoded.slice(SCHEME.length + 1)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses hard enough to be worth doing', () => {
    const log = fixture('fungus-creature-loss-xl63.txt');
    expect(encodeLog(log).length).toBeLessThan(log.length / 5);
  });
});

describe('logUrl', () => {
  it('builds a fragment link for a log that fits', () => {
    const out = logUrl('https://example.com', fixture('snake-xl100.txt'));
    expect(out.full).toBe(true);
    expect(out.url).toContain('/#log=g1.');
  });

  it('falls back to the bare site when the log is too big', () => {
    const out = logUrl('https://example.com', noise(MAX_LINK_CHARS * 4));
    expect(out.full).toBe(false);
    expect(out.url).toBe('https://example.com');
  });

  it('never exceeds the budget', () => {
    const out = logUrl('https://example.com', fixture('fungus-creature-loss-xl63.txt'));
    expect(out.url.length).toBeLessThanOrEqual(MAX_LINK_CHARS);
  });

  it('tolerates a trailing slash on the base', () => {
    expect(logUrl('https://example.com/', 'x').url).toContain('https://example.com/#log=');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -w @dundor/bot`
Expected: FAIL, cannot resolve `./link.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/bot/src/link.ts`:

```ts
import { gzipSync } from 'node:zlib';

/**
 * Encodes a log into a link the browser UI can open.
 *
 * The payload rides in the URL fragment, which is never transmitted in an HTTP
 * request and is stripped from Referer headers. The log therefore reaches
 * neither Cloudflare nor any access log, which is what keeps this consistent
 * with never persisting logs.
 */

/** Scheme tag, so the encoding can change without breaking links already posted. */
export const SCHEME = 'g1';

/**
 * Longest URL to put on a link button.
 *
 * Discord does not document a ceiling and discord.js does not enforce one, so
 * this stays conservative until scripts/probe-button-url.mjs measures the real
 * limit. Every fixture except the 44-turn Fungus log encodes under 3,000.
 */
export const MAX_LINK_CHARS = 3_000;

export function encodeLog(text: string): string {
  return `${SCHEME}.${gzipSync(text, { level: 9 }).toString('base64url')}`;
}

export interface LogLink {
  url: string;
  /** False when the log did not fit, so the URL points at the bare site. */
  full: boolean;
}

export function logUrl(base: string, text: string): LogLink {
  const site = base.replace(/\/+$/, '');
  const url = `${site}/#log=${encodeLog(text)}`;
  return url.length <= MAX_LINK_CHARS ? { url, full: true } : { url: site, full: false };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -w @dundor/bot`
Expected: PASS, including the existing cooldown, format and problems suites.

- [ ] **Step 5: Generate the contract fixture**

This file is what stops the bot's encoder and the web's decoder drifting apart, since neither workspace depends on the other.

```bash
cd ~/dundor-ledger
npm run build -w @dundor/bot
node -e "
const {readFileSync,writeFileSync}=require('node:fs');
import('./apps/bot/dist/link.js').then(({encodeLog})=>{
  const src='snake-xl100.txt';
  const encoded=encodeLog(readFileSync('fixtures/'+src,'utf8'));
  writeFileSync('fixtures/link-contract.json',
    JSON.stringify({scheme:'g1',source:src,encoded},null,2)+'\n');
  console.log('wrote',encoded.length,'chars');
});
"
```

- [ ] **Step 6: Add the contract assertion to the bot test**

Append to `apps/bot/src/link.test.ts`:

```ts
describe('link contract', () => {
  const contract = JSON.parse(fixture('link-contract.json')) as {
    scheme: string;
    source: string;
    encoded: string;
  };

  it('still decodes to the log it was generated from', () => {
    // The web app asserts the same thing from its own decoder. If either side
    // changes the format, one of the two tests fails.
    expect(decode(contract.encoded)).toBe(fixture(contract.source));
  });

  it('uses the scheme this encoder writes', () => {
    expect(contract.scheme).toBe(SCHEME);
  });
});
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm run test -w @dundor/bot`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/bot/src/link.ts apps/bot/src/link.test.ts fixtures/link-contract.json
git commit -m "Encode a log into a fragment link

gzip plus base64url behind a g1 scheme tag, so the encoding can change later
without breaking links already sitting in Discord history. The fragment is
never transmitted, so this carries a log to the browser without it reaching
any server.

link-contract.json pins the format across two workspaces that do not depend on
each other: this side asserts the committed string still decodes, and the web
decoder will assert the same from its end."
```

---

### Task 2: A testable reply builder carrying the button

**Files:**
- Create: `apps/bot/src/reply.ts`
- Create: `apps/bot/src/reply.test.ts`
- Modify: `apps/bot/src/index.ts`

**Interfaces:**
- Consumes: `logUrl` from Task 1; `formatFight` from `./format.js`; `problemReport` and `LogProblem` from `./problems.js`; `ExportedFight` from `@dundor/parser`.
- Produces: `buildReply(opts: ReplyOptions): ReplyDraft` and `sendReply(target, draft)`. `ReplyDraft` is `{ embeds: unknown[]; content?: string; components?: unknown[]; allowedMentions: { repliedUser: false } }`.

Extracting this is what makes the button testable at all. Left inline in `index.ts` it could only be checked by posting to Discord.

- [ ] **Step 1: Write the failing test**

Create `apps/bot/src/reply.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { exportFights, type ExportedFight } from '@dundor/parser';
import { buildReply, sendReply } from './reply.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const fightsIn = (name: string): { fights: ExportedFight[]; text: string } => {
  const text = fixture(name);
  const fights = exportFights(text, name).filter((e): e is ExportedFight => !('error' in e));
  return { fights, text };
};

const button = (draft: ReturnType<typeof buildReply>): { url: string; label: string } =>
  (draft.components as Array<{ components: Array<{ url: string; label: string }> }>)[0]!.components[0]!;


describe('buildReply', () => {
  it('adds no button when no site is configured', () => {
    const { fights, text } = fightsIn('snake-xl100.txt');
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: null });
    expect(draft.components).toBeUndefined();
    expect(draft.embeds).toHaveLength(1);
  });

  it('adds a link button carrying the log when a site is configured', () => {
    const { fights, text } = fightsIn('snake-xl100.txt');
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: 'https://x.dev' });
    expect(button(draft).url).toContain('/#log=g1.');
    expect(button(draft).label).toBe('Open full breakdown');
  });

  it('uses a link-style button in a single action row', () => {
    const { fights, text } = fightsIn('snake-xl100.txt');
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: 'https://x.dev' });
    expect(draft.components).toEqual([
      { type: 1, components: [{ type: 2, style: 5, label: 'Open full breakdown', url: expect.any(String) }] },
    ]);
  });

  it('points at the bare site and says so when the fight is too long', () => {
    const { fights } = fightsIn('snake-xl100.txt');
    // The 44-turn Fungus log encodes to about 4,634 characters, over the
    // default MAX_LINK_CHARS of 3,000. If the probe raises that constant above
    // 4,634 this test starts failing, which is the correct signal to update it.
    const draft = buildReply({
      fights,
      problems: [],
      logText: fixture('fungus-creature-loss-xl63.txt'),
      webUrl: 'https://x.dev',
    });
    expect(button(draft).url).toBe('https://x.dev');
    expect(draft.content).toContain('too long to link');
  });

  it('offers the button as the way to see every fight in a multi-fight paste', () => {
    const { fights, text } = fightsIn('two-fights-one-paste.txt');
    expect(fights.length).toBeGreaterThan(1);
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: 'https://x.dev' });
    expect(draft.content).toContain('button');
  });

  it('keeps the existing wording when several fights arrive with no site configured', () => {
    const { fights, text } = fightsIn('two-fights-one-paste.txt');
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: null });
    expect(draft.content).toContain('Upload one on its own');
  });

  it('still reports problems alongside the embeds', () => {
    const { fights, text } = fightsIn('snake-xl100.txt');
    const draft = buildReply({
      fights,
      problems: [{ kind: 'unparsed', name: 'notes.txt' }],
      logText: text,
      webUrl: null,
    });
    expect(draft.content).toContain('notes.txt');
  });

  it('never pings the person it replies to', () => {
    const { fights, text } = fightsIn('snake-xl100.txt');
    expect(buildReply({ fights, problems: [], logText: text, webUrl: null }).allowedMentions)
      .toEqual({ repliedUser: false });
  });

  it('omits the button when several files were uploaded at once', () => {
    // One link carries one file, so a multi-file upload has no single log to link.
    const { fights } = fightsIn('snake-xl100.txt');
    const draft = buildReply({ fights, problems: [], logText: null, webUrl: 'https://x.dev' });
    expect(draft.components).toBeUndefined();
  });
});

describe('sendReply', () => {
  it('sends the draft as built when Discord accepts it', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const draft = { embeds: [], components: [{ type: 1 }], allowedMentions: { repliedUser: false } as const };
    await sendReply({ reply }, draft);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(draft);
  });

  it('retries without components when Discord rejects the payload', async () => {
    const reply = vi.fn()
      .mockRejectedValueOnce(new Error('Invalid Form Body'))
      .mockResolvedValueOnce(undefined);
    await sendReply({ reply }, {
      embeds: [{ title: 'x' }],
      components: [{ type: 1 }],
      allowedMentions: { repliedUser: false },
    });
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[1]![0]).not.toHaveProperty('components');
    expect(reply.mock.calls[1]![0]).toHaveProperty('embeds');
  });

  it('gives up when the retry has nothing left to drop', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(
      sendReply({ reply }, { embeds: [], allowedMentions: { repliedUser: false } }),
    ).rejects.toThrow('nope');
    expect(reply).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -w @dundor/bot`
Expected: FAIL, cannot resolve `./reply.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/bot/src/reply.ts`:

```ts
import type { ExportedFight } from '@dundor/parser';
import { formatFight } from './format.js';
import { logUrl } from './link.js';
import { problemReport, type LogProblem } from './problems.js';

/**
 * Builds the message the bot posts for a set of parsed fights.
 *
 * Separate from index.ts so the button, the notes and the fallbacks are unit
 * testable. Left inline, the only way to check any of it would be to post to
 * Discord.
 */

/** Several fights in one reply is a wall of text; three is the readable limit. */
const MAX_EMBEDS = 3;

export interface ReplyOptions {
  fights: ExportedFight[];
  problems: LogProblem[];
  /** The single source text to link, or null when there is not exactly one. */
  logText: string | null;
  /** Base URL of the web UI, or null when unset, which means no button. */
  webUrl: string | null;
}

export interface ReplyDraft {
  embeds: unknown[];
  content?: string;
  components?: unknown[];
  allowedMentions: { repliedUser: false };
}

export function buildReply({ fights, problems, logText, webUrl }: ReplyOptions): ReplyDraft {
  const shown = fights.slice(0, MAX_EMBEDS);
  const skipped = fights.length - shown.length;
  const detailed = fights.length === 1;

  const link = webUrl && logText != null ? logUrl(webUrl, logText) : null;

  const notes: string[] = [];
  if (!detailed) {
    const tail = link?.full
      ? `The button opens all ${fights.length}.`
      : 'Upload one on its own for the full breakdown.';
    notes.push(
      skipped > 0
        ? `Showing ${shown.length} of ${fights.length} fights. ${tail}`
        : `${fights.length} fights. ${tail}`,
    );
  }
  if (link && !link.full) {
    notes.push('This fight was too long to link directly. Open the site and drop the .txt on it.');
  }
  const report = problemReport(problems, true);
  if (report) notes.push(report);

  const content = notes.join('\n\n');

  return {
    embeds: shown.map((f) => {
      const e = formatFight(f, detailed);
      return {
        title: e.title,
        description: e.description,
        color: e.color,
        fields: e.fields,
        footer: { text: e.footer },
      };
    }),
    ...(content ? { content } : {}),
    ...(link
      ? {
          components: [
            {
              type: 1,
              components: [{ type: 2, style: 5, label: 'Open full breakdown', url: link.url }],
            },
          ],
        }
      : {}),
    allowedMentions: { repliedUser: false },
  };
}

/**
 * Post the draft, dropping components and retrying once if Discord refuses it.
 *
 * Discord does not document a maximum length for a link button URL, so a badly
 * chosen budget must cost the button rather than the whole reply.
 */
export async function sendReply(
  target: { reply: (options: unknown) => Promise<unknown> },
  draft: ReplyDraft,
): Promise<void> {
  try {
    await target.reply(draft);
  } catch (err) {
    if (!draft.components) throw err;
    console.error('reply with components was rejected, retrying without:', err);
    const { components: _dropped, ...rest } = draft;
    await target.reply(rest);
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -w @dundor/bot`
Expected: PASS.

- [ ] **Step 5: Wire index.ts to the new module**

In `apps/bot/src/index.ts`, add to the imports:

```ts
import { buildReply, sendReply } from './reply.js';
```

Add near the other environment reads, below `problemCooldown`:

```ts
// Unset means no button, so the feature ships dark until the site is published.
const WEB_URL = process.env['LEDGER_WEB_URL']?.trim() || null;
```

Replace the whole tail of `analyzeAttachments`, from `const shown = fights.slice(0, MAX_EMBEDS);` through the closing `}` of the `await msg.reply({ ... })` call, with:

```ts
  // One link carries one file, so only offer it when a single file parsed.
  const logText = sources.length === 1 ? sources[0]!.body : null;
  await sendReply(msg, buildReply({ fights, problems, logText, webUrl: WEB_URL }));
}
```

Track the sources by changing the download loop. Where the body is read, replace:

```ts
    const body = await res.text();
    let parsedHere = 0;
```

with:

```ts
    const body = await res.text();
    sources.push({ name: att.name, body });
    let parsedHere = 0;
```

and declare it beside the other accumulators:

```ts
  const sources: Array<{ name: string; body: string }> = [];
```

Delete the now-unused `MAX_EMBEDS` constant and the `formatFight` import from `index.ts`; both moved to `reply.ts`.

- [ ] **Step 6: Typecheck, test and confirm the dry runner still works**

```bash
npm run typecheck
npm test
npm run build -w @dundor/bot
npm run dry -w @dundor/bot -- "$PWD/fixtures/ghoul-loss-xl100.txt"
```

Expected: typecheck clean, all suites pass, and the dry run prints the Ghoul embed with its Evasion insight exactly as before. The dry runner does not go through `buildReply`, so this confirms nothing regressed in shared formatting.

- [ ] **Step 7: Commit**

```bash
git add apps/bot/src/reply.ts apps/bot/src/reply.test.ts apps/bot/src/index.ts
git commit -m "Offer the browser UI on a link button

Buttons are message components, so the encoded log does not consume the
embed's 6,000 character budget the way a markdown link would, and the insight
text stops competing with it for space.

Moves the reply construction out of the handler so the button, the notes and
the fallbacks are unit testable rather than only checkable by posting to
Discord. sendReply drops components and retries once if Discord refuses the
payload, so a badly chosen budget costs a button rather than the analysis.

Unset LEDGER_WEB_URL means no button, so this ships dark."
```

---

### Task 3: Web-side decoding

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/link.ts`
- Create: `apps/web/src/link.test.ts`
- Modify: `apps/web/tsconfig.json`

**Interfaces:**
- Consumes: `fixtures/link-contract.json` from Task 1.
- Produces: `readFragment(hash: string): Fragment` where `Fragment` is `{ kind: 'none' } | { kind: 'unknown-scheme' } | { kind: 'data'; encoded: string }`; `decodeLog(encoded: string): Promise<string>`; `canDecode(): boolean`.

- [ ] **Step 1: Add vitest to the web workspace**

In `apps/web/package.json`, add to `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

and to `devDependencies`:

```json
    "vitest": "^2.1.8"
```

Then in `apps/web/tsconfig.json`, add alongside the existing keys so tests are not compiled into the published bundle:

```json
  "exclude": ["src/**/*.test.ts"]
```

Install:

```bash
npm install
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/link.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canDecode, decodeLog, readFragment } from './link.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), 'utf8');

const contract = JSON.parse(fixture('link-contract.json')) as {
  scheme: string;
  source: string;
  encoded: string;
};

describe('readFragment', () => {
  it('reports nothing for an empty hash', () => {
    expect(readFragment('')).toEqual({ kind: 'none' });
    expect(readFragment('#')).toEqual({ kind: 'none' });
  });

  it('ignores a hash that is not ours', () => {
    expect(readFragment('#section-3')).toEqual({ kind: 'none' });
  });

  it('extracts the payload from a link this bot produced', () => {
    const out = readFragment(`#log=${contract.encoded}`);
    expect(out.kind).toBe('data');
  });

  it('flags a scheme it does not understand rather than guessing', () => {
    expect(readFragment('#log=g9.AAAA')).toEqual({ kind: 'unknown-scheme' });
  });
});

describe('decodeLog', () => {
  it('recovers the exact log the bot encoded', async () => {
    // The other half of the contract: the bot asserts this same string still
    // decodes from its side. Either encoder or decoder drifting fails a test.
    const frag = readFragment(`#log=${contract.encoded}`);
    if (frag.kind !== 'data') throw new Error('contract fixture did not parse');
    expect(await decodeLog(frag.encoded)).toBe(fixture(contract.source));
  });

  it('rejects a truncated payload rather than returning nonsense', async () => {
    const frag = readFragment(`#log=${contract.encoded.slice(0, 200)}`);
    if (frag.kind !== 'data') throw new Error('expected data');
    await expect(decodeLog(frag.encoded)).rejects.toThrow();
  });

  it('rejects data that is not gzip at all', async () => {
    await expect(decodeLog('bm90IGd6aXA')).rejects.toThrow();
  });
});

describe('canDecode', () => {
  it('is true where DecompressionStream exists', () => {
    expect(canDecode()).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -w @dundor/web`
Expected: FAIL, cannot resolve `./link.js`.

- [ ] **Step 4: Write the implementation**

Create `apps/web/src/link.ts`:

```ts
/**
 * Reads a fight out of the URL fragment.
 *
 * The bot puts a gzipped log after the `#`, which browsers never transmit, so
 * the log arrives here without having passed through any server. This is the
 * decode half of the contract pinned by fixtures/link-contract.json.
 */

const SCHEME = 'g1';

export type Fragment =
  | { kind: 'none' }
  | { kind: 'unknown-scheme' }
  | { kind: 'data'; encoded: string };

export function readFragment(hash: string): Fragment {
  const match = /^#?log=([^.]+)\.(.+)$/.exec(hash);
  if (!match) return { kind: 'none' };
  if (match[1] !== SCHEME) return { kind: 'unknown-scheme' };
  return { kind: 'data', encoded: match[2]! };
}

/** False on browsers without DecompressionStream, so the caller can say so. */
export function canDecode(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

function bytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Throws on anything that is not a well formed payload. */
export async function decodeLog(encoded: string): Promise<string> {
  const stream = new Blob([bytes(encoded)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run test -w @dundor/web`
Expected: PASS.

- [ ] **Step 6: Confirm the whole repo still passes**

Run: `npm test`
Expected: parser, bot and web suites all pass. Root `test` already runs every workspace with a test script.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/src/link.ts apps/web/src/link.test.ts package-lock.json
git commit -m "Read a fight out of the URL fragment

The decode half of the link contract. Asserts against the same committed
string the bot's encoder is checked against, so the two halves cannot drift
apart despite living in workspaces that do not depend on each other.

Adds vitest to the web workspace, which had no tests, and excludes them from
the published bundle the way parser and bot already do."
```

---

### Task 4: Open the linked fight on load

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `readFragment`, `decodeLog`, `canDecode` from Task 3; the existing `load(sources: Source[])` callback and `setStatus`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the mount effect**

In `apps/web/src/App.tsx`, change the React import:

```ts
import { useCallback, useEffect, useState } from 'react';
```

Add the import:

```ts
import { canDecode, decodeLog, readFragment } from './link.js';
```

Insert this immediately after the `onFiles` callback and before `const shown = fights[current];`:

```tsx
  // A fight handed over from Discord. The log rides in the fragment, which the
  // browser never sends to the server, so it arrives having touched nothing.
  // Every failure leaves the drop zone on screen rather than dead-ending.
  useEffect(() => {
    const frag = readFragment(window.location.hash);
    if (frag.kind === 'none') return;

    if (frag.kind === 'unknown-scheme') {
      setStatus({ error: true, text: 'This link was made by a newer version of the bot.' });
      return;
    }
    if (!canDecode()) {
      setStatus({
        error: true,
        text: "Your browser can't open compressed links. Download the .txt from Discord and drop it here.",
      });
      return;
    }

    let cancelled = false;
    decodeLog(frag.encoded)
      .then((text) => {
        // load() already reports a decoded payload that is not a fight log,
        // reusing the parser's own wording.
        if (!cancelled) load([{ label: 'Shared fight', text }]);
      })
      .catch(() => {
        if (!cancelled) setStatus({ error: true, text: 'This link looks damaged or truncated.' });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. `load` is wrapped in `useCallback` with an empty dependency list, so it is stable and the effect runs once.

- [ ] **Step 3: Verify by hand against a real link**

```bash
node -e "
const {readFileSync}=require('node:fs');
import('./apps/bot/dist/link.js').then(({logUrl})=>{
  console.log(logUrl('http://localhost:5173', readFileSync('fixtures/icecorn-xl63.txt','utf8')).url);
});
"
npm run dev
```

Paste the printed URL into the browser. Expected: the Icecorn fight loads with its charts and its critical Matchup insight, without touching the drop zone.

Then check three failure paths by hand:

| Paste this | Expect |
| --- | --- |
| `http://localhost:5173/#log=g9.AAAA` | "made by a newer version" |
| the real URL with 100 characters deleted from the end | "damaged or truncated" |
| `http://localhost:5173/` | the sample fight, unchanged |

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Open a fight handed over from Discord

Reads the fragment on mount and feeds it to the same load path files and
pastes use, so a linked fight behaves identically to a dropped one.

Failures land on the working app with the drop zone visible rather than a
blank page: the worst case degrades to the site the reader could have used
anyway. A payload that decodes but is not a log falls through to load(),
which already reports the parser's own wording."
```

---

### Task 5: Probe Discord's URL ceiling

**Files:**
- Create: `scripts/probe-button-url.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a number, recorded by hand into `MAX_LINK_CHARS` in `apps/bot/src/link.ts`.

Per the repo convention, this is a standalone script run directly. Do not add a Makefile target.

- [ ] **Step 1: Write the script**

Create `scripts/probe-button-url.mjs`:

```js
#!/usr/bin/env node
/**
 * Find the longest link-button URL Discord will accept.
 *
 * Discord does not document a ceiling and discord.js does not enforce one, so
 * MAX_LINK_CHARS in apps/bot/src/link.ts is a guess until this measures it.
 *
 * Posts throwaway messages. Point it at a private channel of your own, not at
 * anyone else's server, and delete them afterwards.
 *
 *   DISCORD_TOKEN=... node scripts/probe-button-url.mjs <channel id>
 */

const token = process.env.DISCORD_TOKEN;
const channel = process.argv[2];

if (!token || !channel) {
  console.error('Usage: DISCORD_TOKEN=... node scripts/probe-button-url.mjs <channel id>');
  process.exit(1);
}

const LENGTHS = [512, 1024, 2000, 3000, 4000, 5000, 6000, 8000];
const posted = [];

async function attempt(length) {
  // base64url alphabet, so the probe URL looks like a real one.
  const url = `https://example.com/#log=g1.${'a'.repeat(Math.max(0, length - 26))}`;
  const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `probe ${length}`,
      components: [
        { type: 1, components: [{ type: 2, style: 5, label: `probe ${length}`, url }] },
      ],
    }),
  });
  if (res.ok) {
    posted.push((await res.json()).id);
    return { ok: true };
  }
  return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
}

let best = 0;
for (const length of LENGTHS) {
  const out = await attempt(length);
  console.log(`${String(length).padStart(5)}  ${out.ok ? 'accepted' : `REJECTED ${out.status} ${out.body}`}`);
  if (!out.ok) break;
  best = length;
  // Discord allows 5 messages per 5 seconds per channel.
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`\nLargest accepted URL length: ${best}`);
console.log('Set MAX_LINK_CHARS below this, leaving a margin.');

for (const id of posted) {
  await fetch(`https://discord.com/api/v10/channels/${channel}/messages/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bot ${token}` },
  });
  await new Promise((r) => setTimeout(r, 400));
}
console.log(`Cleaned up ${posted.length} probe messages.`);
```

- [ ] **Step 2: Check it parses**

Run: `node --check scripts/probe-button-url.mjs`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/probe-button-url.mjs
git commit -m "Add a probe for Discord's button URL ceiling

Discord does not document a maximum length for a link button URL and
discord.js only validates the protocol, so MAX_LINK_CHARS is a guess until
this measures it. Posts throwaway messages at increasing lengths and deletes
them afterwards."
```

---

### Task 6: Document the setting

**Files:**
- Modify: `apps/bot/README.md`
- Modify: `docs/manual/bot-deploy-manual.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

`apps/bot/.env.example` also needs a line, but it is covered by the global `protect-files` hook and must be edited by hand. Flag it rather than attempting it.

- [ ] **Step 1: Document the variable in the bot README**

In `apps/bot/README.md`, after the paragraph describing `LEDGER_PULL_COOLDOWN_SECONDS`, add:

```markdown
`LEDGER_WEB_URL` is the base URL of the web UI, for example
`https://dundor-ledger.example.workers.dev`. When it is set, replies carry an
"Open full breakdown" button that opens the same fight in the browser, with the
log gzipped into the URL fragment. Fragments are never sent to a server, so the
log reaches neither the host nor its logs. When the variable is unset there is
no button. Logs too large to fit link to the bare site instead.
```

- [ ] **Step 2: Add the variable to the deploy manual**

In `docs/manual/bot-deploy-manual.md`, in the "Which Dundor the bot watches" section, after the redeploy note, add:

```markdown
`LEDGER_WEB_URL` in the same file controls the "Open full breakdown" button.
Unset means no button. Setting it up for the first time is covered in
`docs/manual/log-link-manual.md`.
```

- [ ] **Step 3: Commit**

```bash
git add apps/bot/README.md docs/manual/bot-deploy-manual.md
git commit -m "Document LEDGER_WEB_URL

Note for Stephen: apps/bot/.env.example needs the same line added by hand.
The global protect-files hook covers .env* so agents cannot edit it, and it is
already missing LEDGER_PULL_COOLDOWN_SECONDS for the same reason."
```

---

## After the plan

The feature is implemented but off. Turning it on is manual and documented in
`docs/manual/log-link-manual.md`: publish the web app with an interactive
`wrangler login`, run the probe against a private channel, set `MAX_LINK_CHARS`
from the result, then set `LEDGER_WEB_URL` on bespin and restart.

Deploy the bot code before setting the variable, and confirm replies are
unchanged. That separates "the refactor broke something" from "the button
misbehaves", which are otherwise hard to tell apart from a screenshot.
