import { createHmac, randomInt } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import type { Db } from '../db/client';
import { families, familyStudents, invites, memberships, students, userStudentAccess, users } from '../db/schema';
import { HttpError } from '../http/errors';
import { childName } from './children';
import { rulesForMember } from './rules';
import type { MemberRole } from './rules';

// Invites (docs/design.md 7.3): a 6-character code and a link, valid 48 hours, single use. Only the code's SHA-256 is
// stored (build-plan M3 notes), so a database dump holds no usable invite. Someone who already has a Marksy login
// signs in and gets a second membership: one person never needs two logins. The code is stored as its HMAC under
// SESSION_SECRET: a six-character code hashed without a key could be found again from a dump in seconds.

const TTL_MS = 48 * 3_600_000;
/** No 0/O, 1/I/L: a code read aloud or typed from a screen */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const hashCode = (code: string, secret: string) =>
  createHmac('sha256', secret).update(code.trim().toUpperCase()).digest('hex');

export async function createInvite(
  db: Db,
  by: { familyId: string; userId: string },
  role: MemberRole,
  studentIds: string[],
  now: Date,
  secret: string,
): Promise<{ code: string; url: string; expiresAt: Date }> {
  // a student invite is for exactly one child, the student themselves (design.md 7.1)
  if (role === 'student' && studentIds.length !== 1)
    throw new HttpError(400, 'invalid_request', 'A student invite names one child');
  const followed = await db
    .select({ studentId: familyStudents.studentId })
    .from(familyStudents)
    .where(and(eq(familyStudents.familyId, by.familyId), eq(familyStudents.status, 'active')));
  const ids = new Set(followed.map((f) => f.studentId));
  if (studentIds.some((id) => !ids.has(id))) throw new HttpError(404, 'not_found', 'No such child in this family');
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await db.insert(invites).values({
    code: hashCode(code, secret),
    familyId: by.familyId,
    createdBy: by.userId,
    role,
    studentIds: role === 'student' ? studentIds : studentIds.length ? studentIds : [...ids],
    expiresAt,
  });
  return { code, url: `/join/${code}`, expiresAt };
}

async function openInvite(db: Db, code: string, now: Date, secret: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.code, hashCode(code, secret)), gt(invites.expiresAt, now), isNull(invites.usedAt)));
  if (!invite) throw new HttpError(410, 'invite_gone', 'This invite is used, expired or unknown');
  return invite;
}

/** What the invite page shows before anyone signs in: the family, the role, the children's names */
export async function describeInvite(db: Db, code: string, now: Date, secret: string) {
  const invite = await openInvite(db, code, now, secret);
  const [family] = await db.select({ name: families.name }).from(families).where(eq(families.id, invite.familyId));
  const kids = invite.studentIds.length
    ? await db.select().from(students).where(inArray(students.id, invite.studentIds))
    : [];
  return {
    family: family?.name ?? '',
    role: invite.role,
    students: kids.map((k) => ({ id: k.id, name: childName(k) })),
    expiresAt: invite.expiresAt,
  };
}

/**
 * Accepts an invite: a new person (login, password, name) or the signed-in one; the membership with the prepared role,
 * access to the prepared children, and the default rules about each.
 */
export async function acceptInvite(
  db: Db,
  code: string,
  who: { userId: string } | { login: string; password: string; displayName: string },
  now: Date,
  secret: string,
): Promise<{ userId: string; familyId: string }> {
  const invite = await openInvite(db, code, now, secret);
  const passwordHash = 'login' in who ? await hashPassword(who.password) : null;
  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    let userId: string;
    if ('login' in who) {
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.login}) = lower(${who.login.trim()})`);
      if (taken) throw new HttpError(409, 'login_taken', 'This Marksy login is taken; sign in to accept');
      const [user] = await tx
        .insert(users)
        .values({ login: who.login.trim(), displayName: who.displayName.trim(), passwordHash: passwordHash! })
        .returning();
      userId = user!.id;
    } else {
      userId = who.userId;
      const [already] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.familyId, invite.familyId)));
      if (already) throw new HttpError(409, 'already_member', 'You are already in this family');
    }
    // single use: the row is taken by whoever marks it first
    const used = await tx
      .update(invites)
      .set({ usedBy: userId, usedAt: now })
      .where(and(eq(invites.code, invite.code), isNull(invites.usedAt)))
      .returning({ code: invites.code });
    if (!used.length) throw new HttpError(410, 'invite_gone', 'This invite is used, expired or unknown');
    await tx.insert(memberships).values({ userId, familyId: invite.familyId, role: invite.role, createdAt: now });
    const active = await tx
      .select({ studentId: familyStudents.studentId })
      .from(familyStudents)
      .where(and(eq(familyStudents.familyId, invite.familyId), eq(familyStudents.status, 'active')));
    const followed = new Set(active.map((a) => a.studentId));
    for (const studentId of invite.studentIds.filter((id) => followed.has(id)))
      await tx.insert(userStudentAccess).values({ userId, familyId: invite.familyId, studentId }).onConflictDoNothing();
    await rulesForMember(tx, userId, invite.familyId, invite.role);
    return { userId, familyId: invite.familyId };
  });
}
