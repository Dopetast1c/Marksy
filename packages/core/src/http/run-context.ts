import { ProviderPolicyError } from '../providers/errors';
import type {
  DiaryProvider,
  DriftEvent,
  DriftReporter,
  MemoKind,
  MemoOptions,
  ProviderContext,
  Session,
} from '../providers/types';
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

/** Where ctx.memo keeps its values between runs (the server's provider_memo), and which kinds this run reads again */
export interface MemoStore {
  load(key: string): Promise<{ kind: MemoKind; value: unknown } | null>;
  save(kind: MemoKind, key: string, value: unknown): Promise<void>;
  /** The kinds the collector reads again in this run: kept values of these are fetched again once */
  refresh: ReadonlySet<MemoKind>;
}

export interface RunContext {
  ctx: ProviderContext;
  drift: ReturnType<typeof createMemoryDrift>;
  /** provider.login, at most once per run */
  login(credentials: Record<string, string>): Promise<Session>;
  /** Gives ctx.memo its store (a login opened before the collector gets one once the run exists) */
  useMemo(store: MemoStore | null): void;
}

export function createRunContext(
  provider: DiaryProvider,
  options: Omit<ThrottledClientOptions, 'manifest'> & { now?: () => Date; memo?: MemoStore } = {},
): RunContext {
  // whatever logger the server passes, providers only ever see a redacting one
  const log = options.log ? redacting(options.log) : silentLogger;
  const drift = createMemoryDrift();
  // every request made while provider.login runs is part of the login (a challenge, a token), whatever its method or
  // path: none of them is ever handed to onResponse, which stores bodies
  let inLogin = false;
  const observe = options.onResponse;
  let store: MemoStore | null = options.memo ?? null;
  // a key fetched in this run is not fetched again by it, whatever its kind asks
  const fresh = new Set<string>();
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
    async memo<T>(kind: MemoKind, key: string, fetch: () => Promise<T>, opts: MemoOptions<T> = {}): Promise<T> {
      if (!store) return fetch();
      const kept = await store.load(key);
      const due = store.refresh.has(kind) && !fresh.has(key);
      if (kept && kept.kind === kind && !due && (opts.valid?.(kept.value as T) ?? true)) return kept.value as T;
      const value = await fetch();
      fresh.add(key);
      await store.save(kind, key, value);
      return value;
    },
  };
  let loggedIn = false;
  return {
    ctx,
    drift,
    useMemo(next) {
      store = next;
    },
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
