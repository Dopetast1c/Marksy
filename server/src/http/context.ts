import type { Logger, Transport } from '@marksy/core';
import type { Request } from 'express';
import type { Db } from '../db/client';
import type { MemberRole } from '../family/rules';
import { HttpError } from './errors';

// What the API runs on: the database, the key of the diary credentials, the cookie policy, and for tests and the
// demo a transport that answers for a provider instead of the network.

export interface AppDeps {
  db: Db;
  /** CREDENTIALS_KEY: encrypts diary credentials at rest (design.md 7.2 step 4) */
  credentialsKey: Buffer;
  /** Session cookies are Secure only when PUBLIC_URL is https (CLAUDE.md, local and phone testing) */
  secureCookies: boolean;
  now?: () => Date;
  /** Tests and the demo: a provider's transport instead of the network */
  transportFor?: (providerId: string) => Transport | undefined;
  /** Tests and the demo: fixture-only providers may be connected too */
  allowDemoProviders?: boolean;
  log?: Logger;
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
