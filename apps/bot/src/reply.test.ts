import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
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

  it('never lets the rejected payload reach the console, even via error properties', async () => {
    // discord.js's DiscordAPIError carries an own `requestBody` property with
    // the exact JSON that was rejected -- here, the button URL that embeds the
    // log. A retry path that logs the raw error risks that leaking into server
    // logs, which the log-link feature promises never to do.
    const secretUrl = 'https://x.dev/#log=g1.super-secret-log-payload';
    const rejection = Object.assign(new Error('Invalid Form Body'), {
      requestBody: { json: { components: [{ components: [{ url: secretUrl }] }] } },
    });
    const reply = vi.fn().mockRejectedValueOnce(rejection).mockResolvedValueOnce(undefined);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendReply({ reply }, {
      embeds: [],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Open full breakdown', url: secretUrl }] }],
      allowedMentions: { repliedUser: false },
    });

    // depth: null, not the console's own default-2 depth: the fix must not
    // depend on that default staying in place (a structured logger or error
    // tracker walks arbitrarily deep).
    const logged = spy.mock.calls.flat().map((arg) => inspect(arg, { depth: null }));
    expect(logged.join('\n')).not.toContain(secretUrl);

    spy.mockRestore();
  });
});
