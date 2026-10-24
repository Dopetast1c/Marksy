import { createHash } from 'node:crypto';
import { and, eq, ne, notInArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaryAccounts, familyStudents, studentSources, students } from '../db/schema';
import { welcomeChild } from '../family/rules';
import { notifyAdmins } from '../notify/admin';

// Who sees a child and through which login (docs/design.md 7.1, 7.2, 10.2; ux-principles D54). Access comes from the
// diary: a family follows a child while one of its own accounts lists the child; a child is read through one account
// only, the active source, and another source takes over when that account needs action or is paused. The connect
// flow (M4) and the collector both go through here.

/**
 * The inbox key of «another family follows your child»: one per child and following family, without that family's id
 * (the notified family never learns who follows)
 */
export const followKey = (studentId: string, familyId: string) =>
  `follow:${studentId}:${createHash('sha256').update(`${studentId}:${familyId}`).digest('hex').slice(0, 16)}`;

/**
 * The family follows the child (again). A new link to a child another family already follows is «Следить из своей
 * семьи»: no approval, and that family's admins get one notice in their inbox naming only their own child, never this
 * family. Joining the other family is offered at connect only, never here. A link the family stopped («Перестать
 * следить», design.md 7.1) is left alone: no re-link, no notice. A new link gets every member's default rules.
 */
export async function linkFamily(
  db: Db,
  familyId: string,
  studentId: string,
  now: Date,
): Promise<'new' | 'kept' | 'restored'> {
  const [existing] = await db
    .select({ status: familyStudents.status })
    .from(familyStudents)
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
  if (existing?.status === 'active' || existing?.status === 'stopped') return 'kept';
  if (existing) {
    await db
      .update(familyStudents)
      .set({ status: 'active' })
      .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
    return 'restored';
  }
  await db.insert(familyStudents).values({ familyId, studentId, status: 'active', linkedAt: now });
  await welcomeChild(db, familyId, studentId);
  const others = await db
    .select({ familyId: familyStudents.familyId })
    .from(familyStudents)
    .where(
      and(
        eq(familyStudents.studentId, studentId),
        ne(familyStudents.familyId, familyId),
        eq(familyStudents.status, 'active'),
      ),
    );
  if (others.length) {
    const [child] = await db
      .select({ given: students.givenName, display: students.displayName })
      .from(students)
      .where(eq(students.id, studentId));
    for (const other of others) {
      await notifyAdmins(db, other.familyId, {
        // one notice per child and following family, whatever happens to the link later
        eventKey: followKey(studentId, familyId),
        severity: 'info',
        title: 'notification.childFollowed.title',
        body: 'notification.childFollowed.body',
        params: { child: child?.display ?? child?.given ?? '' },
        link: '/family',
      });
    }
  }
  return 'new';
}

/**
 * A login no longer lists these children: its sources go, and a family none of whose accounts lists a child any more
 * stops seeing it (suspended, not deleted: the link comes back when a login shows the child again). A link the family
 * had stopped is deleted then (design.md 7.1); the child goes with the last link.
 */
export async function dropUnlisted(db: Db, account: { id: string; familyId: string }, listed: readonly string[]) {
  const gone = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .where(
      and(
        eq(studentSources.diaryAccountId, account.id),
        listed.length ? notInArray(studentSources.studentId, [...listed]) : undefined,
      ),
    );
  for (const { studentId } of gone) {
    await db
      .delete(studentSources)
      .where(and(eq(studentSources.studentId, studentId), eq(studentSources.diaryAccountId, account.id)));
    const [still] = await db
      .select({ studentId: studentSources.studentId })
      .from(studentSources)
      .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
      .where(and(eq(studentSources.studentId, studentId), eq(diaryAccounts.familyId, account.familyId)));
    if (!still) {
      const link = and(eq(familyStudents.familyId, account.familyId), eq(familyStudents.studentId, studentId));
      const [row] = await db.select({ status: familyStudents.status }).from(familyStudents).where(link);
      if (row?.status === 'stopped') {
        await db.delete(familyStudents).where(link);
        continue;
      }
      await db.update(familyStudents).set({ status: 'suspended' }).where(link);
    }
    await rebalance(db, studentId, new Date());
  }
  return gone.map((g) => g.studentId);
}

/**
 * Exactly one active source per child, on an account that can read: the current one while its account needs no action
 * and is not paused, otherwise the source last seen listing the child among the accounts that can. Only an account
 * whose family follows the child now can be the source: never one of a family that stopped following (design.md 7.1)
 * or has not chosen yet at connect. Returns the active account, or null when the child has no source left.
 */
export async function rebalance(db: Db, studentId: string, now: Date): Promise<string | null> {
  const rows = await db
    .select({
      accountId: studentSources.diaryAccountId,
      active: studentSources.active,
      lastSeenAt: studentSources.lastSeenAt,
      requiresAction: diaryAccounts.requiresAction,
      pausedUntil: diaryAccounts.pausedUntil,
    })
    .from(studentSources)
    .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
    .innerJoin(
      familyStudents,
      and(
        eq(familyStudents.familyId, diaryAccounts.familyId),
        eq(familyStudents.studentId, studentSources.studentId),
        eq(familyStudents.status, 'active'),
      ),
    )
    .where(eq(studentSources.studentId, studentId));
  if (rows.length === 0) {
    // no family reads the child through its own login now: no source is active
    await db.update(studentSources).set({ active: false }).where(eq(studentSources.studentId, studentId));
    return null;
  }
  const canRead = (r: (typeof rows)[number]) => !r.requiresAction && (!r.pausedUntil || r.pausedUntil <= now);
  const current = rows.find((r) => r.active);
  if (current && canRead(current)) return current.accountId;
  const best = rows.filter(canRead).sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];
  // nobody can read now: the current source stays (it is the one that will come back first)
  const next = best ?? current ?? rows[0]!;
  if (next.accountId === current?.accountId) return next.accountId;
  await db.transaction(async (tx) => {
    await tx.update(studentSources).set({ active: false }).where(eq(studentSources.studentId, studentId));
    await tx
      .update(studentSources)
      .set({ active: true })
      .where(and(eq(studentSources.studentId, studentId), eq(studentSources.diaryAccountId, next.accountId)));
  });
  return next.accountId;
}

/** After an account's run: its children move to another source when it now needs action or is paused */
export async function rebalanceAccount(db: Db, accountId: string, now: Date): Promise<void> {
  const rows = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .where(eq(studentSources.diaryAccountId, accountId));
  for (const r of rows) await rebalance(db, r.studentId, now);
}
