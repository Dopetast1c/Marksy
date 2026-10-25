import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkStaged, denyHits, forbiddenPath, messageProblem, stagedFiles } from './commit-guard.mjs';

// A fictional deny-list: what pnpm probe would build from real responses
const deny = {
  words: new Set(['петровская', 'сергеевна']),
  phrases: ['петровская анна сергеевна'],
  ids: ['00aa11bb-2222-4333-8444-555566667777'],
};

describe('pre-commit guard', () => {
  it('refuses local data, secrets, dumps and raw responses; migrations and fixtures pass', () => {
    for (const p of [
      'data/probe/2026-10-23T05-32-26-676Z/07-subjects-1.json',
      'data/deny-list.json',
      '.env',
      'server/.env.local',
      '.env.example',
      '.env.prod',
      '.env - Copy',
      'backup.sql.gz',
      'dump.sql',
      'server/drizzle/meta/../dump.sql',
      'export.har',
      'providers/x/fixtures/raw/me.json',
      'notes/07-subjects-1.json',
    ])
      expect(forbiddenPath(p), p).not.toBeNull();
    for (const p of [
      'env.example',
      'server/drizzle/0005_cli_logins.sql',
      'providers/demo-full/fixtures/subjects-1.json',
      'server/drizzle/meta/0005_snapshot.json',
    ])
      expect(forbiddenPath(p), p).toBeNull();
  });

  it('finds deny-listed names and ids by line; a given name alone or a word inside another is no hit', () => {
    const text = [
      'const a = 1;',
      '"teacher": "Петровская Анна Сергеевна"',
      'Анна',
      'id: 00AA11BB-2222-4333-8444-555566667777',
      'Петровская-Козлова',
      'непетровская',
    ].join('\n');
    expect(denyHits(text, deny)).toEqual([2, 4, 5]);
    // ё and е are the same letter for names
    expect(denyHits('Фёдорова', { words: new Set(['федорова']), phrases: [], ids: [] })).toEqual([1]);
    expect(denyHits('Федорова', { words: new Set(['фёдорова']), phrases: [], ids: [] })).toEqual([1]);
  });

  it('checks a commit message the same way (the commit-msg hook), naming the line only', () => {
    const problem = messageProblem('fix: lessons\n\nseen with Петровская\n', deny);
    expect(problem).toBe('commit refused: the commit message, line 3, has a name or id from the real diary');
    expect(messageProblem('fix: lessons', deny)).toBeNull();
    expect(messageProblem('Петровская', null)).toBeNull();
  });

  it('reports the file and the line, never the value', () => {
    const problems = checkStaged(
      [
        { path: 'docs/notes.md', text: 'x\nПетровская' },
        { path: 'data/x.json', text: '{}' },
      ],
      deny,
    );
    expect(problems).toEqual([
      'docs/notes.md:2: a name or id from the real diary (data/deny-list.json)',
      'data/x.json: the local data folder (real responses, dumps, the deny-list) must never be committed',
    ]);
    expect(problems.join('\n')).not.toMatch(/петровская/i);
  });

  describe('on a real index', () => {
    let dir;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    it('refuses a staged data/ file, a dump and a file with a deny-listed value', () => {
      dir = mkdtempSync(join(tmpdir(), 'marksy-guard-'));
      const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      git('init', '-q');
      mkdirSync(join(dir, 'data'));
      writeFileSync(join(dir, 'data', 'raw.json'), '{}');
      writeFileSync(join(dir, 'marksy.sql.gz'), Buffer.from([0x1f, 0x8b, 0, 1]));
      writeFileSync(join(dir, 'fixture.json'), '{\n  "teacher": "Петровская Анна Сергеевна"\n}\n');
      writeFileSync(join(dir, 'ok.md'), 'nothing here\n');
      git('add', '-f', '.');
      const problems = checkStaged(stagedFiles(dir), deny);
      expect(problems).toEqual([
        'data/raw.json: the local data folder (real responses, dumps, the deny-list) must never be committed',
        'fixture.json:2: a name or id from the real diary (data/deny-list.json)',
        'marksy.sql.gz: a database dump must never be committed',
      ]);
    });
  });
});
