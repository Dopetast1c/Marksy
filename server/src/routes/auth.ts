import { randomBytes } from 'node:crypto';
import { CONSENT_VERSION } from '@marksy/i18n';
import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password';
import { memberships, sessions, users } from '../db/schema';
import { connectDiary } from '../family/connect';
import type { AppDeps } from '../http/context';
import { authOf, connectDepsOf, inBackground } from '../http/context';
import { HttpError } from '../http/errors';
import { underLimit } from '../http/rate-limit';
import type { Limiters } from '../http/rate-limit';
import { route } from '../http/route';
import { endSession, startSession } from '../http/session';
import { buildMe, meResponse } from './me';

// Signing in and out, connecting the first diary, switching the current family (docs/design.md 7.2, 7.4, 9). The
// diary is never called at login time; a Marksy login answers the same way for an unknown login and a wrong password.

const login = z.string().trim().min(3).max(100);
const password = z.string().min(8).max(200);
const displayName = z.string().trim().min(1).max(60);

const connectResponse = meResponse.extend({
  connect: z.object({
    accountId: z.string(),
    /** Children another family already follows: the parent chooses join or follow (design.md 7.2 step 3) */
    matches: z.array(z.object({ studentId: z.string() })),
  }),
});

export function authRoutes(deps: AppDeps, limiters: Limiters): Router {
  const r = Router();
  const now = () => deps.now?.() ?? new Date();

  route(
    r,
    {
      method: 'post',
      path: '/api/auth/login',
      summary: 'Sign in with a Marksy login (never the diary)',
      tags: ['auth'],
      access: 'public',
      body: z.object({ login, password: z.string().min(1).max(200) }),
      response: meResponse,
      errors: { 401: 'Wrong login or password', 429: 'Too many tries; retryAfter in details' },
    },
    async (req, { body }, res) => {
      const ip = req.ip ?? 'unknown';
      // counted before the password is checked: tries sent at once cannot all pass
      const wait = limiters.login.take(ip, body.login);
      if (wait) throw new HttpError(429, 'too_many_tries', 'Too many tries; wait a little', { retryAfter: wait });
      const [user] = await deps.db
        .select()
        .from(users)
        .where(sql`lower(${users.login}) = lower(${body.login})`);
      // the same answer, and about the same time, for an unknown login and a wrong password
      const ok = user
        ? await verifyPassword(user.passwordHash, body.password)
        : await verifyPassword(await dummyHash, body.password).then(() => false);
      if (!user || !ok) throw new HttpError(401, 'wrong_login', 'Wrong login or password');
      limiters.login.succeed(ip, body.login);
      const [first] = await deps.db
        .select({ familyId: memberships.familyId })
        .from(memberships)
        .where(eq(memberships.userId, user.id))
        .orderBy(memberships.createdAt)
        .limit(1);
      await deps.db.update(users).set({ lastLoginAt: now() }).where(eq(users.id, user.id));
      await startSession(deps, res, {
        userId: user.id,
        familyId: first?.familyId ?? null,
        userAgent: req.get('user-agent'),
      });
      return buildMe(deps.db, { userId: user.id, familyId: first?.familyId ?? null });
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/auth/logout',
      summary: 'Sign this browser out',
      tags: ['auth'],
      access: 'session',
      status: 204,
      response: null,
    },
    async (req, _input, res) => {
      await endSession(deps, req, res);
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/auth/me',
      summary: 'Who is signed in, their families and the children they see',
      tags: ['auth'],
      access: 'session',
      response: meResponse,
    },
    async (req) => buildMe(deps.db, authOf(req)),
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/auth/family',
      summary: 'Switch the current family (a person in several families)',
      tags: ['auth'],
      access: 'session',
      body: z.object({ familyId: z.string().uuid() }),
      response: meResponse,
      errors: { 404: 'Not a member of that family' },
    },
    async (req, { body }) => {
      const auth = authOf(req);
      const [m] = await deps.db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, auth.userId), eq(memberships.familyId, body.familyId)));
      if (!m) throw new HttpError(404, 'not_found', 'You are not a member of that family');
      await deps.db.update(sessions).set({ familyId: body.familyId }).where(eq(sessions.id, auth.sessionId));
      return buildMe(deps.db, { userId: auth.userId, familyId: body.familyId });
    },
  );

  route(
    r,
    {
      method: 'patch',
      path: '/api/me',
      summary: 'Change your own name, language or time zone',
      tags: ['auth'],
      access: 'session',
      body: z.object({
        displayName: displayName.optional(),
        locale: z.enum(['ru', 'be', 'uk', 'kk', 'en', 'pl', 'de', 'es', 'pt', 'fr', 'nl', 'ro']).optional(),
        timezone: z
          .string()
          .refine((tz) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: tz });
              return true;
            } catch {
              return false;
            }
          }, 'an IANA time zone')
          .optional(),
        uiMode: z.enum(['full', 'simple']).optional(),
      }),
      response: meResponse,
    },
    async (req, { body }) => {
      const auth = authOf(req);
      if (Object.keys(body).length) await deps.db.update(users).set(body).where(eq(users.id, auth.userId));
      return buildMe(deps.db, auth);
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/auth/connect',
      summary: 'Connect a diary and create the family with its admin (signed out)',
      tags: ['auth'],
      access: 'public',
      status: 201,
      body: z.object({
        providerId: z.string().min(1),
        credentials: z.record(z.string(), z.string().max(500)),
        role: z.enum(['parent', 'student']),
        user: z.object({ login, password, displayName }),
        /**
         * The version of the consent text the person agreed to (design.md 14.1): only the text this build shows, so a
         * stale or crafted client cannot record a version that was never on screen
         */
        consentVersion: z.literal(CONSENT_VERSION),
      }),
      response: connectResponse,
      errors: {
        400: 'Unknown diary system, missing field, or a student diary login (not supported yet)',
        401: 'The diary refused the login',
        409: 'The Marksy login is taken, the diary is connected already, or the diary asks for a code (needs_2fa)',
        503: 'The diary does not answer',
      },
    },
    async (req, { body }, res) => {
      // every connect is a login to the diary: limited per address and per diary login
      const result = await underLimit(limiters.connect, req.ip ?? 'unknown', diaryKey(body), () =>
        connectDiary(connectDepsOf(deps, body.providerId), {
          providerId: body.providerId,
          credentials: body.credentials,
          role: body.role,
          newUser: { ...body.user, consentVersion: body.consentVersion },
        }),
      );
      inBackground(deps, result.firstSync);
      await startSession(deps, res, {
        userId: result.userId,
        familyId: result.familyId,
        userAgent: req.get('user-agent'),
      });
      return {
        ...(await buildMe(deps.db, result)),
        connect: {
          accountId: result.accountId,
          matches: result.children.filter((c) => c.outcome === 'match').map((c) => ({ studentId: c.studentId })),
        },
      };
    },
  );

  return r;
}

/** The limiter's key of a diary login: the system and the login, never the password */
export const diaryKey = (body: { providerId: string; credentials: Record<string, string> }) =>
  `${body.providerId}:${Object.entries(body.credentials).find(([k]) => !/pass|token|secret/i.test(k))?.[1] ?? ''}`;

/** A real hash of a random password, so a login that does not exist costs the same time as a wrong password */
const dummyHash = hashPassword(randomBytes(16).toString('hex'));
