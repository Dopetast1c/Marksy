import { capabilities } from '@marksy/core';
import { gradingScale } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { families, familyStudents, memberships, students, userFiles, userStudentAccess, users } from '../db/schema';
import { childName } from '../family/children';
import type { Auth } from '../http/context';
import { HttpError } from '../http/errors';
import { registry } from '../openapi';
import { avatarOf, avatarOut } from '../students/avatar';
import { appearanceOf, appearanceOut } from '../family/appearance';
import { studentScale } from '../students/scale';

// Who is signed in and what they may see (docs/design.md 9, GET /api/auth/me): the person, their families, the current
// one, and the children they see there, each with provider, school, capabilities and grading scale, so the app needs
// no other call to decide what to show (useCapabilities, useScale).

const role = z.enum(['admin', 'parent', 'student']);

export const studentSummary = registry.register(
  'StudentSummary',
  z.object({
    id: z.string(),
    name: z.string(),
    classLabel: z.string().nullable(),
    grade: z.number().nullable(),
    schoolLabel: z.string().nullable(),
    timezone: z.string(),
    providerId: z.string(),
    capabilities,
    /** null: a year without marks (ux-principles D49) */
    gradingScale: gradingScale.nullable(),
    /** traits or a photo; null: the neutral look until the family sets one */
    avatar: avatarOut,
  }),
);

export const meResponse = registry.register(
  'Me',
  z.object({
    user: z.object({
      id: z.string(),
      login: z.string(),
      displayName: z.string(),
      locale: z.string(),
      timezone: z.string().nullable(),
      uiMode: z.enum(['full', 'simple']),
      /** The person's own «Подсказки» switch (users.settings.guidance); advice shows when the family's is on too */
      guidance: z.boolean(),
      /** Оформление (5.6a): personal, applied on every device the person signs in on */
      appearance: appearanceOut,
    }),
    memberships: z.array(z.object({ familyId: z.string(), familyName: z.string(), role })),
    family: z.object({ id: z.string(), name: z.string(), role }).nullable(),
    students: z.array(studentSummary),
  }),
);

/** The children a person sees in a family: an active link and their own access */
export async function visibleStudents(db: Db, userId: string, familyId: string) {
  return db
    .select({ student: students })
    .from(userStudentAccess)
    .innerJoin(students, eq(students.id, userStudentAccess.studentId))
    .innerJoin(
      familyStudents,
      and(
        eq(familyStudents.familyId, userStudentAccess.familyId),
        eq(familyStudents.studentId, userStudentAccess.studentId),
        eq(familyStudents.status, 'active'),
      ),
    )
    .where(and(eq(userStudentAccess.userId, userId), eq(userStudentAccess.familyId, familyId)))
    .orderBy(asc(students.fullName));
}

export async function buildMe(db: Db, auth: Pick<Auth, 'userId' | 'familyId'>): Promise<z.infer<typeof meResponse>> {
  const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
  const [ownWallpaper] = await db
    .select({ id: userFiles.id })
    .from(userFiles)
    .where(and(eq(userFiles.userId, auth.userId), eq(userFiles.kind, 'wallpaper')))
    .limit(1);
  if (!user) throw new HttpError(401, 'unauthorized', 'Sign in first');
  const rows = await db
    .select({ familyId: memberships.familyId, familyName: families.name, role: memberships.role })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(eq(memberships.userId, auth.userId))
    .orderBy(asc(memberships.createdAt));
  const current = rows.find((r) => r.familyId === auth.familyId) ?? null;
  const kids = current ? await visibleStudents(db, auth.userId, current.familyId) : [];
  const summaries = [];
  for (const { student } of kids) {
    const manifest = getProvider(student.providerId)?.manifest;
    if (!manifest) continue;
    summaries.push({
      id: student.id,
      name: childName(student),
      classLabel: student.classLabel,
      grade: student.grade,
      schoolLabel: student.schoolLabel,
      timezone: student.timezone ?? manifest.timezone,
      providerId: student.providerId,
      capabilities: manifest.capabilities,
      gradingScale: await studentScale(db, student.id),
      avatar: avatarOf(student.avatar, student.id),
    });
  }
  return {
    user: {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      locale: user.locale,
      timezone: user.timezone,
      uiMode: user.uiMode,
      guidance: user.settings.guidance !== false,
      appearance: appearanceOf(user.settings, !!ownWallpaper),
    },
    memberships: rows,
    family: current ? { id: current.familyId, name: current.familyName, role: current.role } : null,
    students: summaries,
  };
}
