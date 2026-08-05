import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, problemReport, type LogProblem } from './problems.js';

const unparsed: LogProblem = { kind: 'unparsed', name: 'notes.txt' };
const oversized: LogProblem = { kind: 'oversized', name: 'history.txt', size: 5_400_000 };
const download: LogProblem = { kind: 'download', name: 'log.txt', status: 404 };

describe('problemReport', () => {
  it('says nothing when nothing went wrong', () => {
    expect(problemReport([], true)).toBeNull();
    expect(problemReport([], false)).toBeNull();
  });

  it('explains an unparseable file in terms of what to do instead', () => {
    const out = problemReport([unparsed], false)!;
    expect(out).toContain('notes.txt');
    expect(out).toContain('dun logs');
  });

  it('reports the actual size against the actual limit', () => {
    const out = problemReport([oversized], false)!;
    expect(out).toContain('5.4 MB');
    expect(out).toContain('2 MB');
  });

  it('surfaces the HTTP status when Discord will not hand the file over', () => {
    expect(problemReport([download], false)!).toContain('404');
  });

  it('bullets several problems rather than running them together', () => {
    const out = problemReport([unparsed, oversized], false)!;
    expect(out).toContain('- ');
    expect(out.split('\n').length).toBeGreaterThan(1);
  });

  it('does not bullet a single problem', () => {
    expect(problemReport([unparsed], false)!.startsWith('- ')).toBe(false);
  });

  it('demotes the wording when part of the upload did parse', () => {
    const out = problemReport([unparsed], true)!;
    expect(out).toContain('Some of that upload did not read');
    expect(out).toContain('notes.txt');
  });

  it('leads with the problem when nothing parsed at all', () => {
    expect(problemReport([unparsed], false)!).not.toContain('Some of that upload');
  });

  it('keeps the limit and the message in agreement', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(2_000_000);
    expect(problemReport([oversized], false)!).toContain('2 MB');
  });
});
