import { describe, expect, it } from 'vitest';
import { DEV_KEYS, ensureKeys } from './env-dev.mjs';

describe('env:dev', () => {
  it('appends missing keys, keeps the rest of the file and its line endings', () => {
    const { text, results } = ensureKeys('PORT=3000\r\nTZ=Europe/Vienna', DEV_KEYS);
    expect(text).toBe(
      'PORT=3000\r\nTZ=Europe/Vienna\r\nMARKSY_ENV=development\r\nDEV_MIN_LOGIN_INTERVAL_MINUTES=10\r\n',
    );
    expect(results).toEqual({ MARKSY_ENV: 'added', DEV_MIN_LOGIN_INTERVAL_MINUTES: 'added' });
  });

  it('never changes a value that is set, even production; fills an empty one in place', () => {
    const before = 'MARKSY_ENV=production\nDEV_MIN_LOGIN_INTERVAL_MINUTES=\nPORT=3000\n';
    const { text, results } = ensureKeys(before, DEV_KEYS);
    expect(text).toBe('MARKSY_ENV=production\nDEV_MIN_LOGIN_INTERVAL_MINUTES=10\nPORT=3000\n');
    expect(results).toEqual({ MARKSY_ENV: 'already set', DEV_MIN_LOGIN_INTERVAL_MINUTES: 'added' });
  });

  it('a commented line or a longer key is not the key; a second run changes nothing', () => {
    const before = '# MARKSY_ENV=development\nMARKSY_ENV_OLD=x\n';
    const once = ensureKeys(before, DEV_KEYS);
    expect(once.results.MARKSY_ENV).toBe('added');
    expect(once.text.startsWith(before)).toBe(true);
    const twice = ensureKeys(once.text, DEV_KEYS);
    expect(twice.text).toBe(once.text);
    expect(Object.values(twice.results)).toEqual(['already set', 'already set']);
  });
});
