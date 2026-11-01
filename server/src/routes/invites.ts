import { listProviders } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { sessions } from '../db/schema';
import { acceptInvite, describeInvite } from '../family/invites';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import { underLimit } from '../http/rate-limit';
import type { Limiters } from '../http/rate-limit';
import { route } from '../http/route';
import { startSession } from '../http/session';
import { assertSignupOpen } from '../http/signup';
import { registry } from '../openapi';
import { buildMe, meResponse } from './me';

// The public routes around joining (docs/design.md 7.2, 7.3): the diary systems a family can connect, and an invite
// before and after it is accepted. A signed-in person accepts with their own login and gets a second membership.

const code = z.string().trim().min(4).max(12);
const localized = z.record(z.string(), z.string());

const providerInfo = registry.register(
  'Provider',
  z.object({
    id: z.string(),
    name: z.string(),
    country: z.string().nullable(),
    status: z.string(),
    roles: z.array(z.string()),
    auth: z.object({
      kind: z.string(),
      fields: z.array(z.object({ key: z.string(), label: localized, type: z.string() })),
    }),
  }),
);

export function inviteRoutes(deps: AppDeps, limiters: Limiters): Router {
  const r = Router();
  const now = () => deps.now?.() ?? new Date();

  route(
    r,
    {
      method: 'get',
      path: '/api/providers',
      summary: 'The diary systems a family can connect, with the fields each asks for',
      tags: ['providers'],
      access: 'public',
      response: z.array(providerInfo),
      errors: { 403: 'Signed out where signing up is closed (SIGNUP)' },
    },
    async (req) => {
      // signed out, the list is what the connect screen offers: only where signing up is open
      await assertSignupOpen(deps, req);
      return listProviders({ all: !!deps.allowDemoProviders }).map(({ manifest: m }) => ({
        id: m.id,
        name: m.name,
        country: m.country,
        status: m.status,
        roles: m.roles,
        auth: { kind: m.auth.kind, fields: m.auth.fields },
      }));
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/invites/:code',
      summary: 'What an invite is for: the family, the role, the children',
      tags: ['invites'],
      access: 'public',
      params: z.object({ code }),
      response: z.object({
        family: z.string(),
        role: z.enum(['admin', 'parent', 'student']),
        students: z.array(z.object({ id: z.string(), name: z.string() })),
        expiresAt: z.date(),
      }),
      errors: { 410: 'Used, expired or unknown' },
    },
    // a code is short: lookups are limited per address, so codes cannot be tried one after another
    async (req, { params }) =>
      underLimit(limiters.invite, req.ip ?? 'unknown', params.code, () =>
        describeInvite(deps.db, params.code, now(), deps.secret),
      ),
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/invites/:code/accept',
      summary: 'Accept an invite: a new Marksy login, or the signed-in one gets another family',
      tags: ['invites'],
      access: 'public',
      params: z.object({ code }),
      body: z
        .object({
          login: z.string().trim().min(3).max(100),
          password: z.string().min(8).max(200),
          displayName: z.string().trim().min(1).max(60),
        })
        .partial(),
      response: meResponse,
      errors: {
        400: 'Signed out without a login, password and name',
        409: 'Login taken or already a member',
        410: 'Used, expired or unknown',
      },
    },
    async (req, { params, body }, res) => {
      if (req.auth) {
        const userId = req.auth.userId;
        const done = await underLimit(limiters.invite, req.ip ?? 'unknown', params.code, () =>
          acceptInvite(deps.db, params.code, { userId }, now(), deps.secret),
        );
        await deps.db.update(sessions).set({ familyId: done.familyId }).where(eq(sessions.id, req.auth.sessionId));
        return buildMe(deps.db, done);
      }
      if (!body.login || !body.password || !body.displayName)
        throw new HttpError(400, 'invalid_request', 'A login, a password and a name, or sign in first');
      const who = { login: body.login, password: body.password, displayName: body.displayName };
      const done = await underLimit(limiters.invite, req.ip ?? 'unknown', params.code, () =>
        acceptInvite(deps.db, params.code, who, now(), deps.secret),
      );
      await startSession(deps, res, { ...done, userAgent: req.get('user-agent') });
      return buildMe(deps.db, done);
    },
  );

  return r;
}
