import type { ProviderManifest } from '@marksy/core';
import { readSyncConfig } from '../sync/config';
import { CLAUDE_HOURS, CLAUDE_RUNS_PER_DAY } from './login-guard';
import type { LoginPolicy } from './login-guard';

// Two modes for the manual real runs (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`; CLAUDE.md "Real diary
// runs"). Development (MARKSY_ENV=development exactly, the default in env.example): one login per account every
// DEV_MIN_LOGIN_INTERVAL_MINUTES (10, which it can only raise), at any hour, no daily cap. Production is everything
// else, fail closed: MARKSY_ENV=production, a missing or misspelt value, and always a production build
// (NODE_ENV=production, whatever MARKSY_ENV says). It keeps the manifest's interval, and for Claude Code at most three
// runs a day between 07:00 and 20:00 school time. SYNC_MIN_LOGIN_INTERVAL tightens both. The scheduler's own runs keep
// the product's rules in either mode (each child's school day, D55); the mode never touches them.

export type RunMode = 'development' | 'production';

/** The development interval, and its floor */
export const DEV_MIN_LOGIN_INTERVAL_DEFAULT = 10;

type Env = Record<string, string | undefined>;

export function runMode(env: Env = process.env): RunMode {
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') return 'production';
  return env.MARKSY_ENV?.trim().toLowerCase() === 'development' ? 'development' : 'production';
}

/** The limits of a manual real run in this mode */
export function manualLoginPolicy(manifest: Pick<ProviderManifest, 'limits'>, env: Env = process.env): LoginPolicy {
  const tightened = readSyncConfig(env).minLoginIntervalMinutes ?? 0;
  if (runMode(env) === 'production')
    return {
      intervalMinutes: Math.max(manifest.limits.minLoginIntervalMinutes, tightened),
      claudeRunsPerDay: CLAUDE_RUNS_PER_DAY,
      claudeHours: CLAUDE_HOURS,
    };
  const raw = Number(env.DEV_MIN_LOGIN_INTERVAL_MINUTES?.trim() || DEV_MIN_LOGIN_INTERVAL_DEFAULT);
  const dev = Number.isFinite(raw) ? Math.ceil(raw) : DEV_MIN_LOGIN_INTERVAL_DEFAULT;
  return {
    intervalMinutes: Math.max(DEV_MIN_LOGIN_INTERVAL_DEFAULT, dev, tightened),
    claudeRunsPerDay: null,
    claudeHours: null,
  };
}
