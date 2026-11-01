import { scaleUnit } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { alertRules, memberships, students, userStudentAccess } from '../db/schema';
import { studentScale } from '../students/scale';

// The default notification rules (docs/design.md 11 and 5.6): one set per user and child, on that child's scale
// (6.4, D53), created when the user joins a family and, for every member, when a child comes into it (7.1). A student
// gets rules about themselves only. The rows are ordinary afterwards; preset_key only makes creating them idempotent,
// so a rule the user deleted is not created again unless the child or the user comes in anew. Delivery comes with M9.

export type MemberRole = 'admin' | 'parent' | 'student';
type Rule = Omit<typeof alertRules.$inferInsert, 'id' | 'userId' | 'familyId' | 'studentId' | 'updatedAt'>;

/** The default rules of one user about one child; `scale` null is a year without marks (no mark or average rules) */
export function defaultRules(role: MemberRole, scale: GradingScale | null, caps: { behaviour: boolean }): Rule[] {
  const parent = role !== 'student';
  const rules: Rule[] = [];
  if (scale) {
    rules.push({ presetKey: 'mark.any', event: 'mark', condition: { dir: 'any' }, when: 'now', enabled: !parent });
    const first = scale.thresholds[0];
    if (first !== undefined)
      rules.push({
        presetKey: 'mark.low',
        event: 'mark',
        condition: { dir: 'worse', value: first },
        when: 'now',
        enabled: parent,
      });
    if (scale.bands.top)
      rules.push({
        presetKey: 'mark.top',
        event: 'mark',
        condition: { dir: 'band', band: 'top' },
        when: 'evening',
        enabled: parent,
      });
    rules.push({
      presetKey: 'average.drop',
      event: 'average',
      // half a by-10 point on this scale, a week against the week before, on at least two marks
      condition: { dir: 'down', step: 0.5 * scaleUnit(scale), period: 'week', minMarks: 2 },
      when: 'now',
      enabled: false,
    });
    rules.push({ presetKey: 'changed', event: 'changed', condition: {}, when: 'now', enabled: parent });
  }
  // a teacher's comment without a mark (D56): only where the diary has them
  if (caps.behaviour)
    rules.push({ presetKey: 'comment', event: 'comment', condition: {}, when: 'evening', enabled: parent });
  rules.push({ presetKey: 'absence', event: 'absence', condition: {}, when: 'now', enabled: parent });
  // tags come with M6: the rule names the preset tags, which M6 resolves to the family's tag rows
  rules.push({
    presetKey: 'tag.test-poem',
    event: 'tag',
    condition: { presetKeys: ['test', 'poem'], moments: ['new', 'evening', 'saturday'] },
    when: 'now',
    enabled: true,
  });
  rules.push({
    presetKey: 'tag.bring',
    event: 'tag',
    condition: { presetKeys: ['bring'], moments: ['evening'] },
    when: 'evening',
    enabled: !parent,
  });
  // the homework digest: for students, and for the parents of a child whose year has no marks yet (design.md 11)
  rules.push({
    presetKey: 'homework',
    event: 'homework',
    condition: { time: '19:00' },
    when: 'evening',
    enabled: !parent || scale === null,
  });
  rules.push({ presetKey: 'summary', event: 'summary', condition: {}, when: 'weekly', enabled: parent });
  return rules;
}

/** Creates the default rules of one user about one child in one family; rules already there stay as they are */
export async function ensureDefaultRules(
  db: Db,
  who: { userId: string; familyId: string; studentId: string; role: MemberRole },
): Promise<void> {
  const [student] = await db
    .select({ providerId: students.providerId })
    .from(students)
    .where(eq(students.id, who.studentId));
  if (!student) return;
  const behaviour = getProvider(student.providerId)?.manifest.capabilities.behaviour ?? 'none';
  const rules = defaultRules(who.role, await studentScale(db, who.studentId), { behaviour: behaviour !== 'none' });
  await db
    .insert(alertRules)
    .values(
      rules.map((r) => ({
        ...r,
        userId: who.userId,
        familyId: who.familyId,
        studentId: who.studentId,
        scope: { students: who.studentId },
      })),
    )
    .onConflictDoNothing();
}

/** The default rules of a user who joined a family, about every child they may see there */
export async function rulesForMember(db: Db, userId: string, familyId: string, role: MemberRole): Promise<void> {
  const seen = await db
    .select({ studentId: userStudentAccess.studentId })
    .from(userStudentAccess)
    .where(and(eq(userStudentAccess.userId, userId), eq(userStudentAccess.familyId, familyId)));
  for (const s of seen) await ensureDefaultRules(db, { userId, familyId, studentId: s.studentId, role });
}

/**
 * A child came into the family (a new diary, "From your own family" (match.follow), a child appearing in a connected
 * account):
 * every admin and parent sees the child (their default, design.md 7.1) and gets the default rules about them.
 */
export async function welcomeChild(db: Db, familyId: string, studentId: string): Promise<void> {
  const adults = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), inArray(memberships.role, ['admin', 'parent'])));
  for (const a of adults) {
    await db.insert(userStudentAccess).values({ userId: a.userId, familyId, studentId }).onConflictDoNothing();
    await ensureDefaultRules(db, { userId: a.userId, familyId, studentId, role: a.role });
  }
}
