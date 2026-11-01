import type { Logger, Transport } from '@marksy/core';
import type { Request } from 'express';
import type { Db } from '../db/client';
import type { AppVersion } from '../runtime/version';
import type { ConnectDeps } from '../family/connect';
import type { MemberRole } from '../family/rules';
import { readSyncConfig } from '../sync/config';
import type { SyncConfig } from '../sync/config';
import { HttpError } from './errors';

// What the API runs on: the database, the key of the diary credentials, the cookie policy, and for tests and the
// demo a transport that answers for a provider instead of the network.

export interface AppDeps {
  db: Db;
  /** CREDENTIALS_KEY: encrypts diary credentials at rest (design.md 7.2 step 4) */
  credentialsKey: Buffer;
  /** SESSION_SECRET: the key invite codes are stored under (HMAC) */
  secret: string;
  /** BASE_PATH, normalised ("" for the root, runtime/network.ts): the Path of the session cookie */
  basePath?: string;
  /**
   * TRUST_PROXY (Express syntax): the proxies whose X-Forwarded-* headers are believed, loopback by default. A session
   * cookie is Secure when the request came over https, as the trusted proxy says.
   */
  trustProxy?: string;
  /**
   * SIGNUP: who may connect a diary without a session. open: anyone (development); first: only while the instance has
   * no family yet (production); closed: nobody
   */
  signup?: 'open' | 'first' | 'closed';
  /** API_DOCS: Swagger and the OpenAPI document open to anyone, behind a session (production), or off */
  apiDocs?: 'open' | 'session' | 'off';
  /** The running version, for /api/health */
  version?: AppVersion;
  now?: () => Date;
  /** Tests and the demo: a provider's transport instead of the network */
  transportFor?: (providerId: string) => Transport | undefined;
  /** Tests and the demo: fixture-only providers may be connected too */
  allowDemoProviders?: boolean;
  log?: Logger;
  /** UPLOADS_DIR: uploaded pictures (14.1), data/uploads by default */
  uploadsDir?: string;
  /** The collector's settings (the first sync after connecting); from the environment by default */
  syncConfig?: SyncConfig;
  /** Tests: no pauses between requests */
  sleep?: (ms: number) => Promise<void>;
  /** Work the answer does not wait for (the first sync); tests collect it to wait for it */
  background?: (work: Promise<unknown>) => void;
}

/** What connecting a diary needs, for one provider */
export function connectDepsOf(deps: AppDeps, providerId: string): ConnectDeps {
  return {
    db: deps.db,
    credentialsKey: deps.credentialsKey,
    syncConfig: deps.syncConfig ?? readSyncConfig(),
    transport: deps.transportFor?.(providerId),
    ...(deps.now && { now: deps.now }),
    ...(deps.sleep && { sleep: deps.sleep }),
    ...(deps.log && { log: deps.log }),
    ...(deps.allowDemoProviders && { allowDemoProviders: true }),
  };
}

/** Lets the first sync run on after the answer, its failure logged (it is a run like any other: sync_runs has it) */
export function inBackground(deps: AppDeps, work: Promise<unknown>): void {
  if (deps.background) return deps.background(work);
  work.catch((err: unknown) =>
    deps.log?.error('first sync failed', { error: err instanceof Error ? err.name : 'Error' }),
  );
}

/** The signed-in person on a request: who, in which family, with which role there */
export interface Auth {
  sessionId: string;
  userId: string;
  /** The current family; null for a person with no family any more */
  familyId: string | null;
  role: MemberRole | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: Auth;
    }
  }
}

/** The signed-in person, or 401 */
export function authOf(req: Request): Auth {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Sign in first');
  return req.auth;
}

/** The signed-in person in their current family, or 403 */
export function memberOf(req: Request): Auth & { familyId: string; role: MemberRole } {
  const auth = authOf(req);
  if (!auth.familyId || !auth.role) throw new HttpError(403, 'no_family', 'You are not a member of a family');
  return auth as Auth & { familyId: string; role: MemberRole };
}
