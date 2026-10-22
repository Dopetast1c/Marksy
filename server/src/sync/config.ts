import type { ProviderManifest } from '@marksy/core';
import type { FamilySettings } from '../db/schema';
import { narrowWindow } from './plan';
import type { EffectiveLimits } from './plan';

// The collector's settings from the environment (.env.example, "Collector"). The provider manifest sets the limits;
// the environment and the family settings can only make them stricter (docs/design.md 10.2).

export interface SyncConfig {
  enabled: boolean;
  tickMinutes: number;
  window?: string;
  weekly?: string;
  jitterMinutes: number;
  minLoginIntervalMinutes?: number;
  catchupAfterMs: number;
  maxRequestsPerRun?: number;
  failuresBeforePause: number;
  pauseHours: number;
  pauseMaxHours: number;
  offlineRetryMinutes: number;
}

/** "24h", "90m", "45" (minutes) -> milliseconds */
export function parseDuration(value: string): number {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*([hm]?)$/i);
  if (!m) throw new Error(`Not a duration: ${value}`);
  return Number(m[1]) * (m[2]?.toLowerCase() === 'h' ? 3_600_000 : 60_000);
}

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, fallback: number): number {
  const v = env[key]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`);
  return n;
}

function pattern(env: Env, key: string, re: RegExp): string | undefined {
  const v = env[key]?.trim();
  if (!v) return undefined;
  if (!re.test(v)) throw new Error(`${key} has the wrong form: ${v}`);
  return v;
}

export function readSyncConfig(env: Env = process.env): SyncConfig {
  const interval = env.SYNC_MIN_LOGIN_INTERVAL?.trim();
  const cap = env.SYNC_MAX_REQUESTS_PER_RUN?.trim();
  return {
    enabled: env.SYNC_ENABLED?.trim().toLowerCase() !== 'false',
    tickMinutes: Math.max(1, num(env, 'SYNC_TICK_MIN', 5)),
    window: pattern(env, 'SYNC_WINDOW', /^\d{2}:\d{2}-\d{2}:\d{2}$/),
    weekly: pattern(env, 'SYNC_WEEKLY', /^(mon|tue|wed|thu|fri|sat|sun) \d{2}:\d{2}-\d{2}:\d{2}$/),
    jitterMinutes: num(env, 'SYNC_JITTER_MIN', 20),
    ...(interval && { minLoginIntervalMinutes: parseDuration(interval) / 60_000 }),
    catchupAfterMs: parseDuration(env.SYNC_CATCHUP_AFTER?.trim() || '24h'),
    ...(cap && { maxRequestsPerRun: num(env, 'SYNC_MAX_REQUESTS_PER_RUN', 40) }),
    failuresBeforePause: Math.max(1, num(env, 'SYNC_FAILURES_BEFORE_PAUSE', 3)),
    pauseHours: num(env, 'SYNC_PAUSE_HOURS', 24),
    pauseMaxHours: num(env, 'SYNC_PAUSE_MAX_HOURS', 168),
    offlineRetryMinutes: num(env, 'SYNC_OFFLINE_RETRY_MIN', 10),
  };
}

/** The limits one account runs under: the manifest's, narrowed by the environment and the family. */
export function effectiveLimits(
  manifest: ProviderManifest,
  config: SyncConfig,
  family: FamilySettings,
): EffectiveLimits {
  const l = manifest.limits;
  return {
    window: narrowWindow(l.syncWindow, config.window, family.sync_window),
    // the weekly window moves the re-scan, it does not add requests: the environment may choose another evening
    weekly: config.weekly ?? l.weeklyRescan,
    minLoginIntervalMinutes: Math.max(l.minLoginIntervalMinutes, config.minLoginIntervalMinutes ?? 0),
    maxRequestsPerRun: Math.min(l.maxRequestsPerRun, config.maxRequestsPerRun ?? Infinity),
    jitterMinutes: config.jitterMinutes,
    catchupAfterMs: config.catchupAfterMs,
    offlineRetryMinutes: config.offlineRetryMinutes,
  };
}
