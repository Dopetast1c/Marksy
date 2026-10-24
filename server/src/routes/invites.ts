import { listProviders } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { sessions } from '../db/schema';
import { acceptInvite, describeInvite } from '../family/invites';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { startSession } from '../http/session';
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

export function inviteRoutes(deps: AppDeps): Router {
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
    },
    async () =>
      listProviders({ all: !!deps.allowDemoProviders }).map(({ manifest: m }) => ({
        id: m.id,
        name: m.name,
        country: m.country,
        status: m.status,
        roles: m.roles,
        auth: { kind: m.auth.kind, fields: m.auth.fields },
      })),
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
    async (_req, { params }) => describeInvite(deps.db, params.code, now()),
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
        const done = await acceptInvite(deps.db, params.code, { userId: req.auth.userId }, now());
        await deps.db.update(sessions).set({ familyId: done.familyId }).where(eq(sessions.id, req.auth.sessionId));
        return buildMe(deps.db, done);
      }
      if (!body.login || !body.password || !body.displayName)
        throw new HttpError(400, 'invalid_request', 'A login, a password and a name, or sign in first');
      const done = await acceptInvite(
        deps.db,
        params.code,
        { login: body.login, password: body.password, displayName: body.displayName },
        now(),
      );
      await startSession(deps, res, { ...done, userAgent: req.get('user-agent') });
      return buildMe(deps.db, done);
    },
  );

  return r;
}
