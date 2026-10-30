import { describe, expect, it } from 'vitest';
import { lintMessage } from './commit-lint.mjs';
import { parseCommit } from './conventional.mjs';

describe('commit messages', () => {
  it('a conventional header in English passes, with or without a scope, a body and git comments', () => {
    expect(lintMessage('feat(web): the update prompt names the new version')).toEqual([]);
    expect(lintMessage('fix: the cookie path\n\nThe body explains why.\n# a git comment')).toEqual([]);
    expect(lintMessage('chore!: drop a setting')).toEqual([]);
    expect(lintMessage('Merge r1-release: the first release')).toEqual([]);
    expect(lintMessage('Revert "feat: x"\n\nThis reverts commit abc.')).toEqual([]);
  });

  it('refuses another style, an unknown type, a long header, a missing blank line and another language', () => {
    expect(lintMessage('M5e: the translations')).toHaveLength(1);
    expect(lintMessage('feature: x')).toHaveLength(1);
    expect(lintMessage(`fix: ${'x'.repeat(100)}`)).toHaveLength(1);
    expect(lintMessage('fix: x\nno blank line')).toHaveLength(1);
    expect(lintMessage('fix: ошибка')).toHaveLength(1);
  });

  it('reads breaking changes from ! and from the footer', () => {
    expect(parseCommit('feat!: x')).toMatchObject({ type: 'feat', breaking: true });
    expect(parseCommit('fix(server): x\n\nBREAKING CHANGE: the API changed')).toMatchObject({ breaking: true });
    expect(parseCommit('fix(server): x')).toMatchObject({ type: 'fix', scope: 'server', breaking: false });
    expect(parseCommit('Merge x')).toMatchObject({ kind: 'merge' });
  });
});
