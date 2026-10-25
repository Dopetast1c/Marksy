import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { students } from '../db/schema';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { avatarOf, avatarOut, avatarTraits } from '../students/avatar';
import type { StoredAvatar } from '../students/avatar';
import { loadChild } from '../students/context';

// A child's avatar (docs/design.md 5.6, 9): the admin and parents set it from Семья; it belongs to the child, so every
// family that follows the child sees the same one (D54). Traits are drawn by the app; a photo is uploaded separately.

const id = z.string().uuid();

export function avatarRoutes(deps: AppDeps): Router {
  const r = Router();

  route(
    r,
    {
      method: 'patch',
      path: '/api/students/:id',
      summary: 'The child’s avatar (admin, parent): traits to draw, or null for the neutral look',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      body: z.object({ avatar: avatarTraits.nullable() }),
      response: z.object({ avatar: avatarOut }),
      errors: { 403: 'A student does not set avatars', 404: 'No such child' },
    },
    async (req, { params, body }) => {
      const ctx = await loadChild(deps, req, params.id);
      if (ctx.role === 'student') throw new HttpError(403, 'forbidden', 'A student does not set avatars');
      const stored: StoredAvatar | null = body.avatar ? { kind: 'traits', traits: body.avatar } : null;
      await deps.db.update(students).set({ avatar: stored }).where(eq(students.id, ctx.student.id));
      return { avatar: avatarOf(stored, ctx.student.id) };
    },
  );

  return r;
}
