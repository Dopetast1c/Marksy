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
import { checkImage, EXT } from '../uploads/image';
import { DEFAULT_UPLOADS_DIR, readUpload, removeUpload, saveUpload } from '../uploads/store';

// A child's avatar (docs/design.md 5.6, 9): the admin and parents set it from Семья; it belongs to the child, so every
// family that follows the child sees the same one (D54). Traits are drawn by the app; a photo is checked and stripped
// of its metadata on the server (14.1) and served only to those families.

const id = z.string().uuid();

/** A photo arrives scaled to 512 px by the browser; the server checks it, never trusts it */
const PHOTO_SIDE = 512;
const PHOTO_MAX_BYTES = 2_000_000;

const photoKey = (stored: unknown) => {
  const a = stored as StoredAvatar | null | undefined;
  return a?.kind === 'photo' ? a.key : null;
};

export function avatarRoutes(deps: AppDeps): Router {
  const r = Router();
  const dir = deps.uploadsDir ?? DEFAULT_UPLOADS_DIR;

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
      await removeUpload(dir, photoKey(ctx.student.avatar));
      return { avatar: avatarOf(stored, ctx.student.id) };
    },
  );

  route(
    r,
    {
      method: 'put',
      path: '/api/students/:id/photo',
      summary: 'A photo as the child’s avatar (admin, parent): JPEG, PNG or WebP up to 512 px, metadata removed (14.1)',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      upload: { maxBytes: PHOTO_MAX_BYTES },
      response: z.object({ avatar: avatarOut }),
      errors: {
        400: 'Not a JPEG, PNG or WebP, or larger than 512 px',
        403: 'A student does not set avatars',
        404: 'No such child',
      },
    },
    async (req, { params, upload }) => {
      const ctx = await loadChild(deps, req, params.id);
      if (ctx.role === 'student') throw new HttpError(403, 'forbidden', 'A student does not set avatars');
      const image = checkImage(upload, { maxBytes: PHOTO_MAX_BYTES, maxSide: PHOTO_SIDE });
      const key = await saveUpload(dir, 'avatars', EXT[image.type], image.bytes);
      const stored: StoredAvatar = { kind: 'photo', key, mime: image.mime, bytes: image.bytes.length };
      await deps.db.update(students).set({ avatar: stored }).where(eq(students.id, ctx.student.id));
      await removeUpload(dir, photoKey(ctx.student.avatar));
      return { avatar: avatarOf(stored, ctx.student.id) };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/photo',
      summary: 'The child’s photo, to the families that follow the child (D54)',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      response: null,
      errors: { 404: 'No such child or no photo' },
    },
    async (req, { params }, res) => {
      const ctx = await loadChild(deps, req, params.id);
      const a = ctx.student.avatar as StoredAvatar | null;
      if (a?.kind !== 'photo') throw new HttpError(404, 'not_found', 'No photo');
      const bytes = await readUpload(dir, a.key);
      // the URL carries a version, so the picture may stay in this browser; never in a shared cache
      res.set({
        'Content-Type': a.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(bytes);
    },
  );

  return r;
}
