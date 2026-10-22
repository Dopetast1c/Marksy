import { ProviderPolicyError } from '../providers/errors';
import type { DiaryProvider, DriftEvent, DriftReporter, ProviderContext, Session } from '../providers/types';
import { redacting, silentLogger } from './logger';
import { createThrottledClient } from './throttled-client';
import type { ThrottledClientOptions } from './throttled-client';

// One collector run against one diary account: one throttled client, one login at most, drift collected for the
// server to store (api_drift_events). The planner (docs/design.md 10.4) decides whether the run may log in at all.

/** A drift sample is kept only when it looks like an enum value or a type name; anything else may be personal. */
const SAFE_SAMPLE = /^[A-Za-z0-9_.:-]{1,40}$/;

/** Collects drift events once per kind, endpoint and path. */
export function createMemoryDrift(): DriftReporter & { readonly events: readonly DriftEvent[] } {
  const seen = new Map<string, DriftEvent>();
  return {
    report({ sample, ...e }) {
      const key = `${e.kind} ${e.endpoint} ${e.path}`;
      if (!seen.has(key)) seen.set(key, sample !== undefined && SAFE_SAMPLE.test(sample) ? { ...e, sample } : e);
    },
    get events() {
      return [...seen.values()];
    },
  };
}

export interface RunContext {
  ctx: ProviderContext;
  drift: ReturnType<typeof createMemoryDrift>;
  /** provider.login, at most once per run */
  login(credentials: Record<string, string>): Promise<Session>;
}

export function createRunContext(
  provider: DiaryProvider,
  options: Omit<ThrottledClientOptions, 'manifest'> & { now?: () => Date } = {},
): RunContext {
  // whatever logger the server passes, providers only ever see a redacting one
  const log = options.log ? redacting(options.log) : silentLogger;
  const drift = createMemoryDrift();
  const ctx: ProviderContext = {
    http: createThrottledClient({ ...options, manifest: provider.manifest, log }),
    log,
    now: options.now ?? (() => new Date()),
    drift,
  };
  let loggedIn = false;
  return {
    ctx,
    drift,
    async login(credentials) {
      if (loggedIn) throw new ProviderPolicyError('One login per run');
      loggedIn = true;
      return provider.login(credentials, ctx);
    },
  };
}
