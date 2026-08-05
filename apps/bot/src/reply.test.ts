import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { DiscordAPIError } from 'discord.js';
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

/** A real DiscordAPIError, the shape sendReply's catch actually narrows on. */
const discordError = (status: number, message: string, body: unknown = {}): DiscordAPIError =>
  new DiscordAPIError(
    { code: 50035, message },
    50035,
    status,
    'POST',
    'https://discord.com/api/v10/channels/x/messages',
    { body, files: undefined },
  );


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

  it('points at the bare site, says so, and uses the fallback label when the fight is too long', () => {
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
    // 'Open full breakdown' would lie here: the fallback URL is the bare site
    // with no fight attached to it.
    expect(button(draft).label).toBe('Open the analyzer');
    expect(draft.content).toContain('too long to link');
  });

  it('offers the site, not "the button", as the way to see every fight in a multi-fight paste', () => {
    const { fights, text } = fightsIn('two-fights-one-paste.txt');
    expect(fights.length).toBeGreaterThan(1);
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: 'https://x.dev' });
    // Not "button": sendReply can drop the button on a rejected payload after
    // this content is already built, and "the site" stays true either way.
    expect(draft.content).toContain('site');
    expect(draft.content).not.toContain('button');
  });

  it('keeps the existing wording when several fights arrive with no site configured', () => {
    const { fights, text } = fightsIn('two-fights-one-paste.txt');
    const draft = buildReply({ fights, problems: [], logText: text, webUrl: null });
    expect(draft.content).toContain('Upload one on its own');
  });

  it('does not contradict itself when a multi-fight paste is also over budget', () => {
    // Two overlapping conditions used to each add their own note: "Upload one
    // on its own for the full breakdown" (from the multi-fight branch) right
    // next to "This fight was too long to link directly" (from the
    // over-budget branch) -- nonsense together, since a single upload is
    // exactly what produced this reply. Only the over-budget note, which
    // already tells the reader how to see every fight, should appear.
    const { fights } = fightsIn('two-fights-one-paste.txt');
    expect(fights.length).toBeGreaterThan(1);
    const draft = buildReply({
      fights,
      problems: [],
      logText: fixture('fungus-creature-loss-xl63.txt'),
      webUrl: 'https://x.dev',
    });
    expect(draft.content).toContain('too long to link');
    expect(draft.content).not.toContain('Upload one on its own');
    expect((draft.content!.match(/too long to link/g) ?? []).length).toBe(1);
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

  it('retries without components on a 400 (the payload itself was rejected)', async () => {
    const reply = vi.fn()
      .mockRejectedValueOnce(discordError(400, 'Invalid Form Body'))
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

  it('does not retry a non-400 rejection: a 403 is futile to resend, and a lost response would double-post', async () => {
    const rejection = discordError(403, 'Missing Permissions');
    const reply = vi.fn().mockRejectedValue(rejection);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendReply({ reply }, {
        embeds: [{ title: 'x' }],
        components: [{ type: 1 }],
        allowedMentions: { repliedUser: false },
      }),
    ).rejects.toBe(rejection);

    expect(reply).toHaveBeenCalledTimes(1);
    // Not just "no retry": no misdiagnosing log line either. The old code
    // logged "retrying without" unconditionally, which would have been a lie
    // for a rejection that was never retried.
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
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
    const rejection = discordError(400, 'Invalid Form Body', {
      components: [{ components: [{ url: secretUrl }] }],
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
