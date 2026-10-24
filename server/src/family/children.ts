import { displayNameOf } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, eq, ne } from 'drizzle-orm';
import { decryptCredentials, encryptCredentials } from '../crypto/credentials';
import type { Db } from '../db/client';
import {
  diaryAccounts,
  familyStudents,
  joinRequests,
  memberships,
  students,
  studentSources,
  syncRuns,
  userStudentAccess,
} from '../db/schema';
import { HttpError } from '../http/errors';
import { linkFamily, rebalance } from '../sync/sources';
import { rulesForMember } from './rules';

// The children a family follows (docs/design.md 7.1, 7.2, D54): the choice at connect for a child another family
// already follows, and «Перестать следить» / «Следить снова» / «Удалить данные» in Семья.

/** How a child is called in the app: the short name the provider gave, or one made from the full name */
export function childName(row: typeof students.$inferSelect): string {
  if (row.displayName) return row.displayName;
  const manifest = getProvider(row.providerId)?.manifest;
  return displayNameOf(
    {
      externalId: row.externalId,
      fullName: row.fullName,
      ...(row.givenName && { givenName: row.givenName }),
      ...(row.familyName && { familyName: row.familyName }),
    },
    manifest?.nameOrder ?? 'given-first',
  );
}

async function linkOf(db: Db, familyId: string, studentId: string) {
  const [row] = await db
    .select({ status: familyStudents.status })
    .from(familyStudents)
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
  return row?.status ?? null;
}

/** Does one of the family's own diary accounts show the child? */
async function familyLoginShows(db: Db, familyId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: studentSources.diaryAccountId })
    .from(studentSources)
    .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
    .where(and(eq(studentSources.studentId, studentId), eq(diaryAccounts.familyId, familyId)));
  return !!row;
}

/** Does another family follow the child (active or stopped: their history is theirs too)? */
async function otherFamilyFollows(db: Db, familyId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ familyId: familyStudents.familyId })
    .from(familyStudents)
    .where(and(eq(familyStudents.studentId, studentId), ne(familyStudents.familyId, familyId)));
  return !!row;
}

/**
 * A child of one of the family's logins whom another family follows and this family does not yet: the choice of
 * design.md 7.2 step 3. «Следить из своей семьи» links the child (no approval; the other family is told once);
 * «Присоединиться» asks the other family's admin to take this login into their family.
 */
export async function chooseMatch(
  db: Db,
  who: { familyId: string; userId: string; role: 'admin' | 'parent' | 'student' },
  accountId: string,
  studentId: string,
  action: 'follow' | 'join',
  now: Date,
): Promise<{ outcome: 'followed' | 'requested' }> {
  const [source] = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
    .where(
      and(
        eq(studentSources.studentId, studentId),
        eq(studentSources.diaryAccountId, accountId),
        eq(diaryAccounts.familyId, who.familyId),
      ),
    );
  if (!source || (await linkOf(db, who.familyId, studentId)))
    throw new HttpError(404, 'not_found', 'No such choice to make');
  // handing the family's diary login to another family is the admin's (design.md 7.6: diary accounts are the admin's)
  if (action === 'join' && who.role !== 'admin')
    throw new HttpError(403, 'forbidden', 'Only the admin moves a diary login to another family');
  if (action === 'follow') {
    await linkFamily(db, who.familyId, studentId, now);
    await rebalance(db, studentId, now);
    return { outcome: 'followed' };
  }
  const [other] = await db
    .select({ familyId: familyStudents.familyId })
    .from(familyStudents)
    .where(
      and(
        eq(familyStudents.studentId, studentId),
        ne(familyStudents.familyId, who.familyId),
        eq(familyStudents.status, 'active'),
      ),
    );
  if (!other) throw new HttpError(409, 'nobody_to_join', 'No other family follows this child now');
  const [pending] = await db
    .select({ id: joinRequests.id })
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.familyId, other.familyId),
        eq(joinRequests.diaryAccountId, accountId),
        eq(joinRequests.status, 'pending'),
      ),
    );
  // asking twice is asking once
  if (!pending)
    await db
      .insert(joinRequests)
      .values({ familyId: other.familyId, fromUserId: who.userId, diaryAccountId: accountId, createdAt: now });
  return { outcome: 'requested' };
}

/**
 * The admin of the family that was asked decides (design.md 7.2): on approval the login becomes this family's diary
 * account (its credentials re-encrypted under this family's key) and the person a parent here; the family they came
 * from stops seeing the children only that login showed.
 */
export async function decideJoin(
  db: Db,
  admin: { familyId: string; userId: string },
  requestId: string,
  approve: boolean,
  credentialsKey: Buffer,
  now: Date,
): Promise<void> {
  const [request] = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.familyId, admin.familyId)));
  if (!request || request.status !== 'pending') throw new HttpError(404, 'not_found', 'No such request');
  if (approve && request.diaryAccountId && request.fromUserId) {
    // the person who asked must still be an admin of the family that owns the login, or nothing moves
    const [owner] = await db
      .select({ familyId: diaryAccounts.familyId })
      .from(diaryAccounts)
      .where(eq(diaryAccounts.id, request.diaryAccountId));
    const [asker] = owner
      ? await db
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.userId, request.fromUserId), eq(memberships.familyId, owner.familyId)))
      : [];
    if (asker?.role !== 'admin') {
      await db
        .update(joinRequests)
        .set({ status: 'declined', decidedBy: admin.userId })
        .where(eq(joinRequests.id, requestId));
      throw new HttpError(409, 'request_stale', 'The person who asked no longer manages this diary login');
    }
  }
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx
      .update(joinRequests)
      .set({ status: approve ? 'approved' : 'declined', decidedBy: admin.userId })
      .where(eq(joinRequests.id, requestId));
    if (!approve || !request.diaryAccountId || !request.fromUserId) return;
    const [account] = await tx.select().from(diaryAccounts).where(eq(diaryAccounts.id, request.diaryAccountId));
    if (!account) return;
    const from = account.familyId;
    // other requests for the same login are answered by this one
    await tx
      .update(joinRequests)
      .set({ status: 'declined', decidedBy: admin.userId })
      .where(
        and(
          eq(joinRequests.diaryAccountId, account.id),
          eq(joinRequests.status, 'pending'),
          ne(joinRequests.id, requestId),
        ),
      );
    const credentials = account.credentialsEnc
      ? encryptCredentials(
          decryptCredentials(account.credentialsEnc, from, credentialsKey),
          admin.familyId,
          credentialsKey,
        )
      : null;
    await tx
      .update(diaryAccounts)
      .set({ familyId: admin.familyId, credentialsEnc: credentials })
      .where(eq(diaryAccounts.id, account.id));
    // the login's sync log goes with it (and the raw bodies with the runs)
    await tx.update(syncRuns).set({ familyId: admin.familyId }).where(eq(syncRuns.diaryAccountId, account.id));
    await tx
      .insert(memberships)
      .values({ userId: request.fromUserId, familyId: admin.familyId, role: 'parent', createdAt: now })
      .onConflictDoNothing();
    const listed = await tx
      .select({ studentId: studentSources.studentId })
      .from(studentSources)
      .where(eq(studentSources.diaryAccountId, account.id));
    for (const { studentId } of listed) {
      await linkFamily(tx, admin.familyId, studentId, now);
      // the family the login came from keeps a child only through another of its own logins
      if (!(await familyLoginShows(tx, from, studentId)))
        await tx
          .update(familyStudents)
          .set({ status: 'suspended' })
          .where(
            and(
              eq(familyStudents.familyId, from),
              eq(familyStudents.studentId, studentId),
              eq(familyStudents.status, 'active'),
            ),
          );
      await rebalance(tx, studentId, now);
    }
    const children = await tx
      .select({ studentId: familyStudents.studentId })
      .from(familyStudents)
      .where(and(eq(familyStudents.familyId, admin.familyId), eq(familyStudents.status, 'active')));
    for (const c of children)
      await tx
        .insert(userStudentAccess)
        .values({ userId: request.fromUserId, familyId: admin.familyId, studentId: c.studentId })
        .onConflictDoNothing();
    await rulesForMember(tx, request.fromUserId, admin.familyId, 'parent');
  });
}

/**
 * «Перестать следить» (design.md 7.1): while a login of the family still shows the child the link is kept as stopped
 * (nothing is deleted, the collector leaves it alone); otherwise the link goes, and the child with the last link.
 */
export async function stopFollowing(db: Db, familyId: string, studentId: string): Promise<'stopped' | 'removed'> {
  const status = await linkOf(db, familyId, studentId);
  if (!status || status === 'stopped') throw new HttpError(404, 'not_found', 'This family does not follow the child');
  const link = and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId));
  if (await familyLoginShows(db, familyId, studentId)) {
    await db.update(familyStudents).set({ status: 'stopped' }).where(link);
    await rebalance(db, studentId, new Date());
    return 'stopped';
  }
  await db.delete(familyStudents).where(link);
  return 'removed';
}

/** «Следить снова»: a stopped link is active again, with the whole history */
export async function followAgain(db: Db, familyId: string, studentId: string, now: Date): Promise<void> {
  if ((await linkOf(db, familyId, studentId)) !== 'stopped')
    throw new HttpError(404, 'not_found', 'This child is not stopped in this family');
  await db
    .update(familyStudents)
    .set({ status: 'active' })
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
  await rebalance(db, studentId, now);
}

/**
 * «Удалить данные» of a stopped child: only when no other family follows them; the link goes and the child's data with
 * it (the trigger of migration 0004). The typed confirmation is the child's name as Семья shows it.
 */
export async function deleteChildData(db: Db, familyId: string, studentId: string, confirm: string): Promise<void> {
  if ((await linkOf(db, familyId, studentId)) !== 'stopped')
    throw new HttpError(409, 'not_stopped', 'Stop following the child first');
  if (await otherFamilyFollows(db, familyId, studentId))
    throw new HttpError(409, 'followed_elsewhere', 'Another family follows this child; their data stays');
  const [row] = await db.select().from(students).where(eq(students.id, studentId));
  if (!row || confirm.trim() !== childName(row))
    throw new HttpError(400, 'confirm_mismatch', 'Type the name to confirm');
  await db
    .delete(familyStudents)
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
}
