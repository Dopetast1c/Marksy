import { describe, expect, it } from 'vitest';
import { checkEnv, checkFile } from './image-audit.mjs';

describe('image audit', () => {
  it('refuses secrets files, dumps, provider fixtures, tests and git', () => {
    for (const path of [
      'app/.env',
      'app/.env.production',
      'backups/x.dump',
      'app/providers/some-diary/fixtures/profile.json',
      'srv/app/.git/config',
      'app/dist/x.test.ts',
      'app/data/deny-list.json',
    ])
      expect(checkFile(path, null), path).not.toEqual([]);
    expect(checkFile('app/env.example', null)).toEqual([]);
  });

  it('looks into the app’s own files only, and names the file, never the value', () => {
    // put together here, so this file itself carries no address outside example.com
    const leak = `const x = "${['parent', 'somewhere.org'].join('@')}";`;
    expect(checkFile('app/dist/marksy.mjs', leak)).toEqual([
      'app/dist/marksy.mjs: an e-mail address outside example.com',
    ]);
    expect(checkFile('app/node_modules/pg/package.json', leak)).toEqual([]);
    expect(checkFile('app/dist/marksy.mjs', 'login: "parent@example.com"')).toEqual([]);
    const deny = { words: new Set(['милена']), phrases: [], ids: [] };
    expect(checkFile('srv/app/assets/index.js', 'a Милена b', deny)).toEqual([
      'srv/app/assets/index.js: a value from the local deny-list',
    ]);
  });

  it('an image variable that looks like a secret', () => {
    expect(checkEnv(['NODE_ENV=production', 'MARKSY_VERSION=1.0.0'])).toEqual([]);
    expect(checkEnv(['SESSION_SECRET=x', 'POSTGRES_PASSWORD=y'])).toEqual([
      'image variable SESSION_SECRET',
      'image variable POSTGRES_PASSWORD',
    ]);
  });
});
