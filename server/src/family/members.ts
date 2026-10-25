import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  alertRules,
  familyStudents,
  memberships,
  notifications,
  sessions,
  userStudentAccess,
  users,
} from '../db/schema';
import { HttpError } from '../http/errors';
import { ensureDefaultRules } from './rules';
import type { MemberRole } from './rules';

// Members of a family (docs/design.md 7.3): the admin changes a member's role and which children they see, or removes
// them; anyone may leave. A family always keeps an admin.

async function membership(db: Db, familyId: string, userId: string) {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.userId, userId)));
  if (!m) throw new HttpError(404, 'not_found', 'No such member');
  return m;
}

async function otherAdmins(db: Db, familyId: string, userId: string): Promise<number> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'admin'), ne(memberships.userId, userId)));
  return rows.length;
}

/**
 * Simple mode for a student member (design.md 5.7: set by a parent or the student). It is the student's own setting,
 * so it follows them into every family they are in. Only a student has it.
 */
export async function setStudentUiMode(db: Db, familyId: string, userId: string, uiMode: 'full' | 'simple') {
  const m = await membership(db, familyId, userId);
  if (m.role !== 'student') throw new HttpError(400, 'not_a_student', 'Simple mode is for a student member');
  await db.update(users).set({ uiMode }).where(eq(users.id, userId));
}

/**
 * A member's role and the children they see (admin). A student sees exactly one child, themselves (design.md 7.1):
 * becoming a student needs that one child. Rules follow: about a child no longer seen they go, and after a role change
 * the defaults are made again for the new role.
 */
export async function changeMember(
  db: Db,
  familyId: string,
  userId: string,
  change: { role?: MemberRole | undefined; studentIds?: string[] | undefined },
): Promise<void> {
  const m = await membership(db, familyId, userId);
  if (change.role && change.role !== 'admin' && m.role === 'admin' && !(await otherAdmins(db, familyId, userId)))
    throw new HttpError(409, 'last_admin', 'The family needs another admin first');
  const role = change.role ?? m.role;
  const roleChanged = !!change.role && change.role !== m.role;
  if (role === 'student' && (change.studentIds?.length ?? (roleChanged ? 0 : 1)) !== 1)
    throw new HttpError(400, 'student_needs_one_child', 'A student sees exactly one child: name them');
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    if (change.role)
      await tx
        .update(memberships)
        .set({ role: change.role })
        .where(and(eq(memberships.familyId, familyId), eq(memberships.userId, userId)));
    if (change.studentIds) {
      const followed = await tx
        .select({ studentId: familyStudents.studentId })
        .from(familyStudents)
        .where(and(eq(familyStudents.familyId, familyId), inArray(familyStudents.status, ['active', 'stopped'])));
      const ids = new Set(followed.map((f) => f.studentId));
      if (change.studentIds.some((id) => !ids.has(id))) throw new HttpError(404, 'not_found', 'No such child');
      await tx
        .delete(userStudentAccess)
        .where(and(eq(userStudentAccess.familyId, familyId), eq(userStudentAccess.userId, userId)));
      for (const studentId of change.studentIds)
        await tx.insert(userStudentAccess).values({ userId, familyId, studentId }).onConflictDoNothing();
    }
    if (change.studentIds || roleChanged) {
      const seen = await tx
        .select({ studentId: userStudentAccess.studentId })
        .from(userStudentAccess)
        .where(and(eq(userStudentAccess.familyId, familyId), eq(userStudentAccess.userId, userId)));
      const keep = seen.map((x) => x.studentId);
      await tx.delete(alertRules).where(
        and(
          eq(alertRules.familyId, familyId),
          eq(alertRules.userId, userId),
          // a new role starts from its own defaults; otherwise only rules about children no longer seen go
          roleChanged || !keep.length ? undefined : notInArray(alertRules.studentId, keep),
        ),
      );
      for (const studentId of keep) await ensureDefaultRules(tx, { userId, familyId, studentId, role });
    }
  });
}

/** Removes a member (or a member leaves): their membership, access, rules and sessions in this family go */
export async function removeMember(db: Db, familyId: string, userId: string): Promise<void> {
  const m = await membership(db, familyId, userId);
  if (m.role === 'admin' && !(await otherAdmins(db, familyId, userId)))
    throw new HttpError(409, 'last_admin', 'The family needs another admin first, or delete the family');
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx.delete(alertRules).where(and(eq(alertRules.familyId, familyId), eq(alertRules.userId, userId)));
    // the family's notices in their inbox go with them (14.1)
    await tx.delete(notifications).where(and(eq(notifications.familyId, familyId), eq(notifications.userId, userId)));
    await tx
      .delete(userStudentAccess)
      .where(and(eq(userStudentAccess.familyId, familyId), eq(userStudentAccess.userId, userId)));
    await tx.delete(memberships).where(and(eq(memberships.familyId, familyId), eq(memberships.userId, userId)));
    // sessions in this family move to another one at their next request, or have none
    await tx
      .update(sessions)
      .set({ familyId: null })
      .where(and(eq(sessions.userId, userId), eq(sessions.familyId, familyId)));
  });
}
