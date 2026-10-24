import type { ProviderManifest } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { CLAUDE_HOURS, CLAUDE_RUNS_PER_DAY } from './login-guard';
import { manualLoginPolicy, runMode } from './mode';

const manifest = { limits: { minLoginIntervalMinutes: 60 } } as ProviderManifest;
const production = { intervalMinutes: 60, claudeRunsPerDay: CLAUDE_RUNS_PER_DAY, claudeHours: CLAUDE_HOURS };

describe('the mode of manual real runs', () => {
  it('development only when asked for exactly; anything else is production', () => {
    expect(runMode({ MARKSY_ENV: 'development' })).toBe('development');
    expect(runMode({ MARKSY_ENV: ' Development ' })).toBe('development');
    for (const value of [undefined, '', 'production', 'prod', 'dev', 'developmnet'])
      expect(runMode({ MARKSY_ENV: value })).toBe('production');
  });

  it('a production build ignores the development mode even when it is set', () => {
    const env = { NODE_ENV: 'production', MARKSY_ENV: 'development', DEV_MIN_LOGIN_INTERVAL_MINUTES: '10' };
    expect(runMode(env)).toBe('production');
    expect(manualLoginPolicy(manifest, env)).toEqual(production);
  });

  it('development: DEV_MIN_LOGIN_INTERVAL_MINUTES, never below 10; no cap, any hour', () => {
    const dev = { MARKSY_ENV: 'development' };
    expect(manualLoginPolicy(manifest, dev)).toEqual({
      intervalMinutes: 10,
      claudeRunsPerDay: null,
      claudeHours: null,
    });
    expect(manualLoginPolicy(manifest, { ...dev, DEV_MIN_LOGIN_INTERVAL_MINUTES: '15' }).intervalMinutes).toBe(15);
    for (const low of ['0', '1', '9.5', '-5', 'soon', 'Infinity'])
      expect(manualLoginPolicy(manifest, { ...dev, DEV_MIN_LOGIN_INTERVAL_MINUTES: low }).intervalMinutes).toBe(10);
  });

  it('SYNC_MIN_LOGIN_INTERVAL tightens both modes, never loosens them', () => {
    expect(manualLoginPolicy(manifest, { SYNC_MIN_LOGIN_INTERVAL: '2h' }).intervalMinutes).toBe(120);
    expect(manualLoginPolicy(manifest, { SYNC_MIN_LOGIN_INTERVAL: '30m' }).intervalMinutes).toBe(60);
    const dev = { MARKSY_ENV: 'development', SYNC_MIN_LOGIN_INTERVAL: '30m' };
    expect(manualLoginPolicy(manifest, dev).intervalMinutes).toBe(30);
  });
});
