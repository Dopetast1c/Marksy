import type { ProviderManifest } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { CLAUDE_HOURS, CLAUDE_RUNS_PER_DAY } from './login-guard';
import { manualLoginPolicy, runMode } from './mode';

const manifest = { limits: { minLoginIntervalMinutes: 60 } } as ProviderManifest;

describe('the mode of manual real runs', () => {
  it('development unless production is asked for', () => {
    expect(runMode({})).toBe('development');
    expect(runMode({ MARKSY_ENV: 'development' })).toBe('development');
    expect(runMode({ MARKSY_ENV: ' production ' })).toBe('production');
  });

  it('a production build ignores the development mode even when it is set', () => {
    const env = { NODE_ENV: 'production', MARKSY_ENV: 'development', DEV_MIN_LOGIN_INTERVAL_MINUTES: '1' };
    expect(runMode(env)).toBe('production');
    expect(manualLoginPolicy(manifest, env)).toEqual({
      intervalMinutes: 60,
      claudeRunsPerDay: CLAUDE_RUNS_PER_DAY,
      claudeHours: CLAUDE_HOURS,
    });
  });

  it('development: DEV_MIN_LOGIN_INTERVAL_MINUTES (10 by default), no cap, any hour', () => {
    expect(manualLoginPolicy(manifest, {})).toEqual({ intervalMinutes: 10, claudeRunsPerDay: null, claudeHours: null });
    expect(manualLoginPolicy(manifest, { DEV_MIN_LOGIN_INTERVAL_MINUTES: '15' }).intervalMinutes).toBe(15);
    // a value that is no interval falls back to the default, never to no interval at all
    for (const bad of ['0', '-5', 'soon'])
      expect(manualLoginPolicy(manifest, { DEV_MIN_LOGIN_INTERVAL_MINUTES: bad }).intervalMinutes).toBe(10);
  });
});
