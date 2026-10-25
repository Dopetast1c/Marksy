import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { familyStudents, memberships, students, userFiles } from '../db/schema';
import { removeUpload } from './store';

// Pictures go with the data they belong to (docs/design.md 10.4, 14.1): when a child's data or a family is erased,
// the files are removed at once, not left for the daily janitor (which only runs with the collector). The keys are
// taken before the rows go; a file is removed only when no row points at it any more (another family may still
// follow the child, a person may still be in another family).

/** The picture keys of these children (their photos) and these people (their wallpapers) */
export async function pictureKeys(db: Db, of: { studentIds?: string[]; userIds?: string[] }): Promise<string[]> {
  const keys: string[] = [];
  if (of.studentIds?.length)
    for (const s of await db
      .select({ avatar: students.avatar })
      .from(students)
      .where(inArray(students.id, of.studentIds))) {
      const a = s.avatar as { kind?: string; key?: string } | null;
      if (a?.kind === 'photo' && a.key) keys.push(a.key);
    }
  if (of.userIds?.length)
    keys.push(
      ...(
        await db.select({ key: userFiles.storageKey }).from(userFiles).where(inArray(userFiles.userId, of.userIds))
      ).map((f) => f.key),
    );
  return keys;
}

/** Removes the files of these keys that no row points at any more */
export async function forgetPictures(db: Db, dir: string, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const still = await db.execute<{ key: string }>(
    sql`select avatar->>'key' as key from students where avatar->>'kind' = 'photo'
        union select storage_key from user_files`,
  );
  const kept = new Set(still.rows.map((r) => r.key));
  for (const key of keys) if (!kept.has(key)) await removeUpload(dir, key);
}

/** The children a family follows and its members: what erasing the family takes pictures from */
export async function familyPictureKeys(db: Db, familyId: string): Promise<string[]> {
  const kids = await db
    .select({ id: familyStudents.studentId })
    .from(familyStudents)
    .where(eq(familyStudents.familyId, familyId));
  const people = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(eq(memberships.familyId, familyId));
  return pictureKeys(db, { studentIds: kids.map((k) => k.id), userIds: people.map((p) => p.id) });
}
