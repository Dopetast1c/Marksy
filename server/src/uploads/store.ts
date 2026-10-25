import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../http/errors';

// Where uploaded pictures live (docs/design.md 14.1): files under UPLOADS_DIR (data/uploads by default), outside git
// and outside anything served directly; the API hands each one out only to who may see it. A file is named by a
// random id, never by anything the uploader sent.

export const DEFAULT_UPLOADS_DIR = fileURLToPath(new URL('../../../data/uploads', import.meta.url));

/** A key is "<area>/<uuid>.<ext>": nothing else is ever read or removed */
const KEY = /^(avatars|wallpapers)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export async function saveUpload(dir: string, area: 'avatars' | 'wallpapers', ext: string, bytes: Buffer) {
  const key = `${area}/${randomUUID()}.${ext}`;
  await mkdir(join(dir, area), { recursive: true });
  await writeFile(join(dir, key), bytes);
  return key;
}

function pathOf(dir: string, key: string) {
  if (!KEY.test(key)) throw new HttpError(404, 'not_found', 'No such file');
  const full = resolve(dir, key);
  if (!full.startsWith(resolve(dir))) throw new HttpError(404, 'not_found', 'No such file');
  return full;
}

export async function readUpload(dir: string, key: string): Promise<Buffer> {
  try {
    return await readFile(pathOf(dir, key));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(404, 'not_found', 'No such file');
  }
}

/** A replaced or removed picture is deleted at once: nothing is kept that nobody sees */
export async function removeUpload(dir: string, key: string | null | undefined) {
  if (!key || !KEY.test(key)) return;
  await rm(pathOf(dir, key), { force: true });
}

/**
 * The retention janitor's sweep (design.md 10.4): every picture no row points at any more goes, whatever removed the
 * row (a child's data deleted, a family erased, the last family that followed a child gone). Files younger than an
 * hour stay, so an upload whose row is still being written is never swept. Returns how many went.
 */
export async function sweepUploads(dir: string, keep: ReadonlySet<string>, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const area of ['avatars', 'wallpapers'] as const) {
    let names: string[];
    try {
      names = await readdir(join(dir, area));
    } catch {
      continue;
    }
    for (const name of names) {
      const key = `${area}/${name}`;
      if (!KEY.test(key) || keep.has(key)) continue;
      const info = await stat(join(dir, key));
      if (now - info.mtimeMs < 3_600_000) continue;
      await rm(join(dir, key), { force: true });
      removed++;
    }
  }
  return removed;
}
