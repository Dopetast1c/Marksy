import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  alertRules,
  attendance,
  behaviourEvents,
  bellSchedules,
  diaryAccounts,
  families,
  familyStudents,
  finalMarks,
  holidays,
  homeworkItems,
  lessonPrep,
  lessons,
  lessonTags,
  markHistory,
  marks,
  memberships,
  notifications,
  schoolYears,
  students,
  studySessions,
  subjectColors,
  subjectGoals,
  subjects,
  terms,
  users,
  weekTemplates,
} from '../db/schema';
import { HttpError } from '../http/errors';

// The family's own data and the data of the children it follows (docs/design.md 14.1): an export as JSON for the
// admin, and erasure after a typed confirmation. Names of another family's members are never in an export: a shared
// child's tick made there is "another family". Credentials never leave the database.

export async function exportFamily(db: Db, familyId: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId));
  if (!family) throw new HttpError(404, 'not_found', 'No such family');
  const members = await db
    .select({ userId: users.id, displayName: users.displayName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.familyId, familyId));
  const ours = new Map(members.map((m) => [m.userId, m.displayName]));
  const author = (id: string | null) => (id === null ? null : (ours.get(id) ?? 'another family'));
  const accounts = await db
    .select({ providerId: diaryAccounts.providerId, label: diaryAccounts.label, status: diaryAccounts.status })
    .from(diaryAccounts)
    .where(eq(diaryAccounts.familyId, familyId));
  const links = await db.select().from(familyStudents).where(eq(familyStudents.familyId, familyId));

  const children = [];
  for (const link of links) {
    const id = link.studentId;
    const [student] = await db.select().from(students).where(eq(students.id, id));
    const years = await db.select().from(schoolYears).where(eq(schoolYears.studentId, id));
    const yearIds = years.map((y) => y.id);
    const markRows = await db.select().from(marks).where(eq(marks.studentId, id));
    children.push({
      link: { status: link.status, settings: link.settings, linkedAt: link.linkedAt },
      student: { ...student, avatar: undefined },
      schoolYears: years,
      terms: yearIds.length ? await db.select().from(terms).where(inArray(terms.schoolYearId, yearIds)) : [],
      holidays: yearIds.length ? await db.select().from(holidays).where(inArray(holidays.schoolYearId, yearIds)) : [],
      subjects: await db.select().from(subjects).where(eq(subjects.studentId, id)),
      lessons: await db.select().from(lessons).where(eq(lessons.studentId, id)),
      marks: markRows,
      markHistory: markRows.length
        ? await db
            .select()
            .from(markHistory)
            .where(
              inArray(
                markHistory.markId,
                markRows.map((m) => m.id),
              ),
            )
        : [],
      attendance: await db.select().from(attendance).where(eq(attendance.studentId, id)),
      homework: (await db.select().from(homeworkItems).where(eq(homeworkItems.studentId, id))).map((h) => ({
        ...h,
        createdBy: author(h.createdBy),
      })),
      teacherRemarks: await db.select().from(behaviourEvents).where(eq(behaviourEvents.studentId, id)),
      finals: (await db.select().from(finalMarks).where(eq(finalMarks.studentId, id))).map((f) => ({
        ...f,
        enteredBy: author(f.enteredBy),
      })),
      ready: (await db.select().from(lessonPrep).where(eq(lessonPrep.studentId, id))).map((p) => ({
        ...p,
        doneBy: author(p.doneBy),
      })),
      studySessions: (await db.select().from(studySessions).where(eq(studySessions.studentId, id))).map((s) => ({
        ...s,
        createdBy: author(s.createdBy),
      })),
      subjectColors: await db.select().from(subjectColors).where(eq(subjectColors.studentId, id)),
      subjectGoals: await db.select().from(subjectGoals).where(eq(subjectGoals.studentId, id)),
      bells: await db.select().from(bellSchedules).where(eq(bellSchedules.studentId, id)),
      regularWeek: await db.select().from(weekTemplates).where(eq(weekTemplates.studentId, id)),
    });
  }
  return {
    exportedFor: 'Marksy family export (docs/design.md 14.1)',
    family: {
      name: family.name,
      createdAt: family.createdAt,
      settings: family.settings,
      consentVersion: family.consentVersion,
      consentAt: family.consentAt,
    },
    members: members.map((m) => ({ displayName: m.displayName, role: m.role })),
    diaryAccounts: accounts,
    children,
    tags: await db.select().from(lessonTags).where(eq(lessonTags.familyId, familyId)),
    alertRules: await db.select().from(alertRules).where(eq(alertRules.familyId, familyId)),
    notifications: members.length
      ? await db
          .select()
          .from(notifications)
          .where(
            inArray(
              notifications.userId,
              members.map((m) => m.userId),
            ),
          )
      : [],
  };
}

/**
 * Erases the family (design.md 14.1): every row it owns goes with it (cascades), a child only this family followed goes
 * with the last link (migration 0004), and a person left in no family at all is removed too.
 */
export async function eraseFamily(db: Db, familyId: string, confirm: string): Promise<void> {
  const [family] = await db.select({ name: families.name }).from(families).where(eq(families.id, familyId));
  if (!family) throw new HttpError(404, 'not_found', 'No such family');
  if (confirm.trim() !== family.name.trim())
    throw new HttpError(400, 'confirm_mismatch', 'Type the family name to confirm');
  await db.transaction(async (tx) => {
    const people = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.familyId, familyId));
    await tx.delete(families).where(eq(families.id, familyId));
    if (people.length)
      await tx.delete(users).where(
        and(
          inArray(
            users.id,
            people.map((p) => p.userId),
          ),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(memberships)
              .where(eq(memberships.userId, users.id)),
          ),
        ),
      );
  });
}
