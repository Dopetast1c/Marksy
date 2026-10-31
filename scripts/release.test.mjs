import { describe, expect, it } from 'vitest';
import { compareVersions, imageTags, nextVersion, releaseNotes } from './release.mjs';

describe('the next version', () => {
  it('a feat raises MINOR and resets PATCH', () => {
    expect(nextVersion('1.1.2', ['fix: a', 'feat(web): tags', 'chore: b'])).toMatchObject({
      status: 'release',
      version: '1.2.0',
      bump: 'minor',
    });
  });

  it('a fix or a perf without a feat raises PATCH', () => {
    expect(nextVersion('1.2.0', ['fix(server): the cookie path', 'docs: x'])).toMatchObject({
      version: '1.2.1',
      bump: 'patch',
    });
    expect(nextVersion('1.2.1', ['perf: faster feed'])).toMatchObject({ version: '1.2.2' });
  });

  it('only chores, docs, tests, CI, build or refactoring: nothing to release', () => {
    expect(nextVersion('1.2.0', ['chore: a', 'docs: b', 'test: c', 'ci: d', 'build: e', 'refactor: f'])).toMatchObject({
      status: 'none',
    });
  });

  it('a breaking commit never raises MAJOR: it asks the owner', () => {
    expect(nextVersion('1.2.0', ['feat!: a new data model'])).toMatchObject({ status: 'ask' });
    expect(nextVersion('1.2.0', ['fix: x\n\nBREAKING CHANGE: the API changed'])).toMatchObject({ status: 'ask' });
  });

  it('the first release is 1.0.0; merges and other styles count for nothing', () => {
    expect(nextVersion(null, ['feat: x', 'Merge r1-release: y'])).toMatchObject({ version: '1.0.0' });
    expect(nextVersion('1.0.0', ['Merge a', 'M5e: old style'])).toMatchObject({ status: 'none' });
  });

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0);
  });
});

describe('image tags of a release', () => {
  it('the newest release gets X.Y.Z, X.Y, X and stable', () => {
    expect(imageTags('1.2.0', ['v1.0.0', 'v1.1.3'])).toEqual(['1.2.0', '1.2', '1', 'stable']);
    expect(imageTags('1.0.0', [])).toEqual(['1.0.0', '1.0', '1', 'stable']);
  });

  it('a late fix of an older line moves only its own line', () => {
    expect(imageTags('1.3.5', ['v1.3.4', 'v1.4.0'])).toEqual(['1.3.5', '1.3']);
    expect(imageTags('1.9.1', ['v1.9.0', 'v2.0.0'])).toEqual(['1.9.1', '1.9', '1']);
  });
});

describe('release notes', () => {
  it('Features and Fixes from the subjects, the migrations, the README in twelve languages', () => {
    const notes = releaseNotes('1.2.0', ['feat(web): tags on lessons', 'fix: the cookie path', 'chore: tidy'], {
      migrations: ['0014_tags'],
    });
    expect(notes).toContain('### Features\n\n- Tags on lessons (web)');
    expect(notes).toContain('### Fixes\n\n- The cookie path');
    expect(notes).not.toContain('Tidy');
    expect(notes).toContain('1 migration: 0014_tags');
    expect(notes).toContain('/blob/v1.2.0/docs/running.md');
    expect(notes).toContain('/blob/v1.2.0/docs/adding-a-diary.md');
    expect(notes).toContain('/blob/v1.2.0/README.kk.md');
    expect(notes.match(/\]\(https/g)).toHaveLength(14);
    expect(notes).toContain('marksy-docs-v1.2.0.zip');
    expect(notes).toContain('marksy-deploy-v1.2.0.zip');
  });

  it('no migration: says so', () => {
    expect(releaseNotes('1.2.1', ['fix: x'])).toContain('No database changes.');
  });
});
