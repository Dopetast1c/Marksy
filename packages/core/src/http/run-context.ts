import { ProviderPolicyError } from '../providers/errors';
import type { DiaryProvider, DriftEvent, DriftReporter, ProviderContext, Session } from '../providers/types';
import { redacting, silentLogger } from './logger';
import { createThrottledClient } from './throttled-client';
import type { ThrottledClientOptions } from './throttled-client';

// One collector run against one diary account: one throttled client, one login at most, drift collected for the
// server to store (api_drift_events). The planner (docs/design.md 10.4) decides whether the run may log in at all.

// Drift events are stored (api_drift_events) and pushed to the admin, so they carry the shape of a change, never data
// (docs/design.md 10.4: names, uuids and comments replaced). A sample survives only as an UPPER_SNAKE enum value, a
// short number or a type name; a path keeps its schema keys and every other segment (ids, uuids, logins) becomes *.

const SAFE_SAMPLE = /^(?:[A-Z][A-Z0-9_]{0,39}|\d{1,5}|string|number|boolean|object|array|null)$/;
/** A path segment that is a schema key: a word, not an id */
const SCHEMA_KEY = /^[A-Za-z_][A-Za-z_]*[A-Za-z0-9_]{0,3}$/;
const SAFE_ENDPOINT = /^[a-z][a-z0-9_/-]{0,60}$/i;

export function normaliseDriftPath(path: string): string {
  return path
    .split('.')
    .map((segment) => {
      const array = segment.endsWith('[]');
      const key = array ? segment.slice(0, -2) : segment;
      return (SCHEMA_KEY.test(key) && key.length <= 40 ? key : '*') + (array ? '[]' : '');
    })
    .join('.');
}

/** Collects drift events once per kind, endpoint and path shape. */
export function createMemoryDrift(): DriftReporter & { readonly events: readonly DriftEvent[] } {
  const seen = new Map<string, DriftEvent>();
  return {
    report({ sample, ...raw }) {
      const e = {
        ...raw,
        endpoint: SAFE_ENDPOINT.test(raw.endpoint) ? raw.endpoint : '*',
        path: normaliseDriftPath(raw.path),
      };
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
  // every request made while provider.login runs is part of the login (a challenge, a token), whatever its method or
  // path: none of them is ever handed to onResponse, which stores bodies
  let inLogin = false;
  const observe = options.onResponse;
  const ctx: ProviderContext = {
    http: createThrottledClient({
      ...options,
      manifest: provider.manifest,
      log,
      ...(observe && { onResponse: (res) => void (inLogin || observe(res)) }),
    }),
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
      inLogin = true;
      try {
        return await provider.login(credentials, ctx);
      } finally {
        inLogin = false;
      }
    },
  };
}
