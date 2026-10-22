import { ProviderPolicyError } from '../providers/errors';
import type { DiaryProvider, DriftEvent, DriftReporter, Logger, ProviderContext, Session } from '../providers/types';
import { createThrottledClient } from './throttled-client';
import type { ThrottledClientOptions } from './throttled-client';

// One collector run against one diary account: one throttled client, one login at most, drift collected for the
// server to store (api_drift_events). The planner (docs/design.md 10.4) decides whether the run may log in at all.

const SECRET_KEY = /pass|token|secret|authorization|cookie|credential|session|login/i;
const REDACTED = '[redacted]';

function redact(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data;
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      SECRET_KEY.test(k)
        ? REDACTED
        : v && typeof v === 'object' && !Array.isArray(v)
          ? redact(v as Record<string, unknown>)
          : v,
    ]),
  );
}

export type LogSink = (level: keyof Logger, msg: string, data?: Record<string, unknown>) => void;

/** A logger that replaces every value under a credential-like key before it reaches the sink. */
export function createLogger(sink: LogSink): Logger {
  const at = (level: keyof Logger) => (msg: string, data?: Record<string, unknown>) => sink(level, msg, redact(data));
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

export const silentLogger: Logger = createLogger(() => undefined);

/** Collects drift events once per kind, endpoint and path. */
export function createMemoryDrift(): DriftReporter & { readonly events: readonly DriftEvent[] } {
  const seen = new Map<string, DriftEvent>();
  return {
    report(e) {
      const key = `${e.kind} ${e.endpoint} ${e.path}`;
      if (!seen.has(key)) seen.set(key, e);
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
  const log = options.log ?? silentLogger;
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
