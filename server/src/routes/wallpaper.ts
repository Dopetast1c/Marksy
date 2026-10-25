import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { userFiles } from '../db/schema';
import type { AppDeps } from '../http/context';
import { authOf } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { checkImage, EXT } from '../uploads/image';
import { DEFAULT_UPLOADS_DIR, readUpload, removeUpload, saveUpload } from '../uploads/store';

// The person's own wallpaper (docs/design.md 5.6a, 14.1): scaled to 1600 px by the browser, checked and stripped of its
// metadata here, one per person, seen only by them. A new one replaces the old one, file and row.

const SIDE = 1600;
const MAX_BYTES = 5_000_000;

export function wallpaperRoutes(deps: AppDeps): Router {
  const r = Router();
  const dir = deps.uploadsDir ?? DEFAULT_UPLOADS_DIR;
  const mine = async (userId: string) =>
    deps.db
      .select()
      .from(userFiles)
      .where(and(eq(userFiles.userId, userId), eq(userFiles.kind, 'wallpaper')));

  route(
    r,
    {
      method: 'put',
      path: '/api/me/wallpaper',
      summary: 'Your own wallpaper: JPEG, PNG or WebP up to 1600 px and 5 MB, metadata removed (14.1); only you see it',
      tags: ['auth'],
      access: 'session',
      upload: { maxBytes: MAX_BYTES },
      response: z.object({ hasOwnWallpaper: z.boolean() }),
      errors: { 400: 'Not a JPEG, PNG or WebP, or larger than 1600 px' },
    },
    async (req, { upload }) => {
      const auth = authOf(req);
      const image = checkImage(upload, { maxBytes: MAX_BYTES, maxSide: SIDE });
      const key = await saveUpload(dir, 'wallpapers', EXT[image.type], image.bytes);
      const old = await mine(auth.userId);
      await deps.db.transaction(async (tx) => {
        await tx.delete(userFiles).where(and(eq(userFiles.userId, auth.userId), eq(userFiles.kind, 'wallpaper')));
        await tx.insert(userFiles).values({
          userId: auth.userId,
          kind: 'wallpaper',
          mime: image.mime,
          bytes: image.bytes.length,
          width: image.width,
          height: image.height,
          storageKey: key,
        });
      });
      for (const f of old) await removeUpload(dir, f.storageKey);
      return { hasOwnWallpaper: true };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/me/wallpaper',
      summary: 'Your own wallpaper, to you only',
      tags: ['auth'],
      access: 'session',
      response: null,
      errors: { 404: 'No wallpaper of your own' },
    },
    async (req, _input, res) => {
      const [f] = await mine(authOf(req).userId);
      if (!f) throw new HttpError(404, 'not_found', 'No wallpaper of your own');
      const bytes = await readUpload(dir, f.storageKey);
      res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.send(bytes);
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/me/wallpaper',
      summary: 'Remove your own wallpaper (the picture is deleted)',
      tags: ['auth'],
      access: 'session',
      status: 204,
      response: null,
    },
    async (req) => {
      const auth = authOf(req);
      const old = await mine(auth.userId);
      await deps.db.delete(userFiles).where(and(eq(userFiles.userId, auth.userId), eq(userFiles.kind, 'wallpaper')));
      for (const f of old) await removeUpload(dir, f.storageKey);
    },
  );

  return r;
}
