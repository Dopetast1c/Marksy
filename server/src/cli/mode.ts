import type { ProviderManifest } from '@marksy/core';
import { CLAUDE_HOURS, CLAUDE_RUNS_PER_DAY } from './login-guard';
import type { LoginPolicy } from './login-guard';

// Two modes for the manual real runs (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`; CLAUDE.md "Real diary
// runs"). Development (MARKSY_ENV=development, the default in .env.example): one login per account every
// DEV_MIN_LOGIN_INTERVAL_MINUTES (10), at any hour, no daily cap. Production (MARKSY_ENV=production, or a production
// build: NODE_ENV=production, which wins over anything else): the manifest's interval, and for Claude Code at most
// three runs a day between 07:00 and 20:00 school time. The scheduler's own runs keep the product's rules in both
// (each child's school day, D55); the development mode never touches them.

export type RunMode = 'development' | 'production';

export const DEV_MIN_LOGIN_INTERVAL_DEFAULT = 10;

export function runMode(env: Record<string, string | undefined> = process.env): RunMode {
  if (env.NODE_ENV?.trim() === 'production') return 'production';
  return env.MARKSY_ENV?.trim() === 'production' ? 'production' : 'development';
}

/** The limits of a manual real run in this mode */
export function manualLoginPolicy(
  manifest: Pick<ProviderManifest, 'limits'>,
  env: Record<string, string | undefined> = process.env,
): LoginPolicy {
  if (runMode(env) === 'production')
    return {
      intervalMinutes: manifest.limits.minLoginIntervalMinutes,
      claudeRunsPerDay: CLAUDE_RUNS_PER_DAY,
      claudeHours: CLAUDE_HOURS,
    };
  const raw = Number(env.DEV_MIN_LOGIN_INTERVAL_MINUTES?.trim() || DEV_MIN_LOGIN_INTERVAL_DEFAULT);
  const intervalMinutes = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : DEV_MIN_LOGIN_INTERVAL_DEFAULT;
  return { intervalMinutes, claudeRunsPerDay: null, claudeHours: null };
}
