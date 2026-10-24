import { createRunContext } from '@marksy/core';
import type {
  AccountInfo,
  DiaryProvider,
  Logger,
  ObservedResponse,
  RunContext,
  Session,
  Transport,
} from '@marksy/core';

// A login opened before the collector runs (docs/design.md 7.2, 10.4): connecting a diary logs in and reads the
// account once, then the first sync goes on in the same login, through the same throttled client, so a new account
// is read at once without a second login. Read responses that arrive before the sync run exists are kept and handed
// to the collector, which stores them with the run like every other body.

export interface OpenedLogin {
  provider: DiaryProvider;
  run: RunContext;
  session: Session;
  info: AccountInfo;
  /** Sends every read response so far, and every later one, to the collector's store */
  observe(fn: (r: ObservedResponse) => void): void;
}

export interface OpenOptions {
  transport?: Transport | undefined;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: Logger;
  /** Stricter limits from the environment, as for any run */
  stricter?: { maxRequestsPerRun?: number };
}

export async function openLogin(
  provider: DiaryProvider,
  credentials: Record<string, string>,
  opts: OpenOptions = {},
): Promise<OpenedLogin> {
  const early: ObservedResponse[] = [];
  let sink: (r: ObservedResponse) => void = (r) => early.push(r);
  const run = createRunContext(provider, {
    ...(opts.transport && { transport: opts.transport }),
    ...(opts.now && { now: opts.now }),
    ...(opts.sleep && { sleep: opts.sleep }),
    ...(opts.random && { random: opts.random }),
    ...(opts.log && { log: opts.log }),
    ...(opts.stricter && { stricter: opts.stricter }),
    onResponse: (r) => sink(r),
  });
  const session = await run.login(credentials);
  const info = await provider.getAccount(session, run.ctx);
  return {
    provider,
    run,
    session,
    info,
    observe(fn) {
      for (const r of early.splice(0)) fn(r);
      sink = fn;
    },
  };
}
