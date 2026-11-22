import { manifestScale } from '@marksy/core';
import type { AccountInfo, Calendar, FinalMark, ProviderManifest, StudentRef, Subject } from '@marksy/core';
import { and, asc, desc, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  finalMarks,
  finalMarksRaw,
  holidays,
  MANIFEST_SCALE,
  schoolYears,
  studentIdentities,
  students,
  familyStudents,
  studentSources,
  studentYears,
  subjects,
  terms,
} from '../db/schema';
import { dropUnlisted, linkFamily, rebalance } from './sources';
import { normName } from './upsert';

// Students, school years, terms, holidays, subjects and finals: what a run learns before it fetches any week. A run
// reads them again by the child's settings (design.md 10.2) and otherwise loads them from here; ids from the provider
// stay in external_id.

export type { StudentRow } from './readers';
export { readableStudents, sourcedStudents } from './readers';
import type { StudentRow } from './readers';

export interface AccountRef {
  id: string;
  familyId: string;
  providerId: string;
}

export interface StoredStudents {
  /** Every child the account lists */
  listed: StudentRow[];
  /** The children this account is the active source of: the ones its run reads (one read per child, design.md 10.2) */
  readable: StudentRow[];
}

/**
 * One child an account lists: the child's row (one per system, whichever login lists them), the identity, and this
 * account as a source. Linking the family and choosing the active source are the caller's (storeStudents, connect).
 */
export async function upsertListedStudent(
  db: Db,
  account: AccountRef,
  s: AccountInfo['students'][number],
  now: Date,
): Promise<StudentRow> {
  const values = {
    fullName: s.fullName,
    givenName: s.givenName ?? null,
    familyName: s.familyName ?? null,
    schoolId: s.schoolId ?? null,
    schoolLabel: s.schoolName ?? null,
    timezone: s.timezone ?? null,
    classExternalId: s.classExternalId ?? null,
    classLabel: s.className ?? null,
    grade: s.grade ?? null,
    gradeLabel: s.gradeLabel ?? null,
    isActive: true,
  };
  const [row] = await db
    .insert(students)
    .values({ ...values, providerId: account.providerId, externalId: s.externalId })
    .onConflictDoUpdate({ target: [students.providerId, students.externalId], set: values })
    .returning();
  const studentId = row!.id;
  await db
    .insert(studentIdentities)
    .values({ providerId: account.providerId, externalId: s.externalId, studentId })
    .onConflictDoNothing();
  await db
    .insert(studentSources)
    .values({ studentId, diaryAccountId: account.id, externalId: s.externalId, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [studentSources.studentId, studentSources.diaryAccountId],
      set: { externalId: s.externalId, lastSeenAt: now },
    });
  return row!;
}

/**
 * No link of this family to the child, and another family follows them: "Join that family" (match.join) or "From your
 * own family" (match.follow) is pending
 */
async function awaitingChoice(db: Db, familyId: string, studentId: string): Promise<boolean> {
  const links = await db
    .select({ familyId: familyStudents.familyId })
    .from(familyStudents)
    .where(eq(familyStudents.studentId, studentId));
  return links.length > 0 && !links.some((l) => l.familyId === familyId);
}

/**
 * The children an account lists: one row per child and system, whichever login lists them (design.md 7.1, 7.2). The
 * account becomes a source of each (the active one when the child has no source that can read), its family follows each
 * child it lists (sources.ts linkFamily), and a child it no longer lists loses this source (dropUnlisted).
 */
export async function storeStudents(
  db: Db,
  account: AccountRef,
  info: AccountInfo,
  now = new Date(),
): Promise<StoredStudents> {
  const listed: StudentRow[] = [];
  const before = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .where(eq(studentSources.diaryAccountId, account.id));
  const shownBefore = new Set(before.map((b) => b.studentId));
  for (const s of info.students) {
    const row = await upsertListedStudent(db, account, s, now);
    const studentId = row.id;
    // the link first: only an account whose family follows the child can become its source. A child this login showed
    // already, whom another family follows and this one does not, waits for the parent's choice made at connect
    // (design.md 7.2 step 3): the collector links only a child that appears in the login anew
    if (!(shownBefore.has(studentId) && (await awaitingChoice(db, account.familyId, studentId))))
      await linkFamily(db, account.familyId, studentId, now);
    await rebalance(db, studentId, now);
    listed.push(row);
  }
  await dropUnlisted(
    db,
    account,
    listed.map((s) => s.id),
  );
  const mine = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .where(and(eq(studentSources.diaryAccountId, account.id), eq(studentSources.active, true)));
  const readable = new Set(mine.map((m) => m.studentId));
  return { listed, readable: listed.filter((s) => readable.has(s.id)) };
}

/** The provider's view of a stored student, for the provider's methods. */
export function studentRef(s: StudentRow): StudentRef {
  return {
    externalId: s.externalId,
    fullName: s.fullName,
    ...(s.givenName && { givenName: s.givenName }),
    ...(s.familyName && { familyName: s.familyName }),
    ...(s.schoolId && { schoolId: s.schoolId }),
    ...(s.classExternalId && { classExternalId: s.classExternalId }),
    ...(s.classLabel && { className: s.classLabel }),
    ...(s.grade !== null && { grade: s.grade }),
    ...(s.gradeLabel && { gradeLabel: s.gradeLabel }),
  };
}

export interface StoredCalendar {
  schoolYearId: string;
  /** term external id -> terms.id */
  termIds: Map<string, string>;
}

/** student_years.grading_scale_id: a built-in id, MANIFEST_SCALE for an inline manifest scale, null for no marks */
export function scaleIdOf(manifest: ProviderManifest, calendar: Calendar): string | null {
  if (calendar.gradingScaleId !== undefined) return calendar.gradingScaleId;
  return typeof manifest.gradingScale === 'string' ? manifestScale(manifest).id : MANIFEST_SCALE;
}

export async function storeCalendar(
  db: Db,
  manifest: ProviderManifest,
  student: StudentRow,
  calendar: Calendar,
): Promise<StoredCalendar> {
  return db.transaction(async (tx) => {
    const y = calendar.schoolYear;
    const [year] = await tx
      .insert(schoolYears)
      .values({
        studentId: student.id,
        providerId: student.providerId,
        externalId: y.externalId,
        label: y.label,
        startDate: y.start,
        endDate: y.end,
      })
      .onConflictDoUpdate({
        target: [schoolYears.studentId, schoolYears.providerId, schoolYears.externalId],
        set: { label: y.label, startDate: y.start, endDate: y.end },
      })
      .returning({ id: schoolYears.id });
    const schoolYearId = year!.id;
    const termIds = new Map<string, string>();
    for (const t of calendar.terms) {
      const values = {
        kind: t.kind,
        index: t.index,
        label: t.label,
        startDate: t.start,
        endDate: t.end,
        note: t.note ?? null,
      };
      const [row] = await tx
        .insert(terms)
        .values({ ...values, schoolYearId, externalId: t.externalId })
        .onConflictDoUpdate({ target: [terms.schoolYearId, terms.externalId], set: values })
        .returning({ id: terms.id });
      termIds.set(t.externalId, row!.id);
    }
    // holidays are replaced as a whole: the calendar is the source
    await tx.delete(holidays).where(eq(holidays.schoolYearId, schoolYearId));
    if (calendar.holidays?.length) {
      await tx.insert(holidays).values(
        calendar.holidays.map((h) => ({
          schoolYearId,
          startDate: h.from,
          endDate: h.to,
          note: h.note ?? null,
          kind: h.kind ?? null,
        })),
      );
    }
    const gradingScaleId = scaleIdOf(manifest, calendar);
    const yearValues = { classLabel: student.classLabel, grade: student.grade, gradingScaleId };
    await tx
      .insert(studentYears)
      .values({ ...yearValues, studentId: student.id, schoolYearId })
      .onConflictDoUpdate({ target: [studentYears.studentId, studentYears.schoolYearId], set: yearValues });
    await tx.update(students).set({ gradingScaleId }).where(eq(students.id, student.id));
    return { schoolYearId, termIds };
  });
}

/**
 * The stored calendar of the school year that contains `today` (or the last one that started), as the provider gave
 * it: what a run uses when it does not read the calendar again (design.md 10.2). Null before the first read.
 */
export async function loadCalendar(
  db: Db,
  studentId: string,
  today: string,
): Promise<{ calendar: Calendar; stored: StoredCalendar } | null> {
  const [year] = await db
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.studentId, studentId), lte(schoolYears.startDate, today)))
    .orderBy(desc(schoolYears.startDate))
    .limit(1);
  if (!year) return null;
  const t = await db.select().from(terms).where(eq(terms.schoolYearId, year.id)).orderBy(asc(terms.startDate));
  const h = await db.select().from(holidays).where(eq(holidays.schoolYearId, year.id));
  const calendar: Calendar = {
    schoolYear: { externalId: year.externalId, label: year.label, start: year.startDate, end: year.endDate },
    terms: t.map((x) => ({
      externalId: x.externalId,
      kind: x.kind,
      index: x.index,
      label: x.label,
      start: x.startDate,
      end: x.endDate,
      ...(x.note && { note: x.note }),
    })),
    ...(h.length && {
      holidays: h.map((x) => ({
        from: x.startDate,
        to: x.endDate,
        ...(x.note && { note: x.note }),
        ...(x.kind && { kind: x.kind }),
      })),
    }),
  };
  return { calendar, stored: { schoolYearId: year.id, termIds: new Map(t.map((x) => [x.externalId, x.id])) } };
}

/** The stored subjects of a child's school year: external id -> subjects.id */
export async function loadSubjectIds(db: Db, studentId: string, schoolYearId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: subjects.id, externalId: subjects.externalId })
    .from(subjects)
    .where(and(eq(subjects.studentId, studentId), eq(subjects.schoolYearId, schoolYearId)));
  return new Map(rows.map((r) => [r.externalId, r.id]));
}

/** Subject external id -> subjects.id */
export async function storeSubjects(
  db: Db,
  student: StudentRow,
  schoolYearId: string,
  list: Subject[],
  opts: { details?: boolean } = {},
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const s of list) {
    const name = { name: s.name, nameNorm: normName(s.name) };
    // the run's early read only names subjects; the daily read after the school details replaces every detail, so a
    // teacher or subgroup that is gone is cleared, and an early read never wipes the day's details
    const details = {
      shortName: s.shortName ?? null,
      teacherExternalId: s.teacherExternalId ?? null,
      teacherName: s.teacherName ?? null,
      groupLabel: s.groupLabel ?? null,
      level: s.level ?? null,
      levelLabel: s.levelLabel ?? null,
      lessonsPerWeek: s.lessonsPerWeek ?? null,
      credits: s.credits ?? null,
      gradingScheme: s.gradingScheme ?? null,
    };
    const values = opts.details ? { ...name, ...details } : name;
    const [row] = await db
      .insert(subjects)
      .values({
        ...name,
        ...details,
        studentId: student.id,
        schoolYearId,
        providerId: student.providerId,
        externalId: s.externalId,
      })
      .onConflictDoUpdate({
        target: [subjects.studentId, subjects.schoolYearId, subjects.providerId, subjects.externalId],
        set: values,
      })
      .returning({ id: subjects.id });
    ids.set(s.externalId, row!.id);
  }
  // subjects that only appear in lessons are known too
  const rows = await db
    .select({ id: subjects.id, externalId: subjects.externalId })
    .from(subjects)
    .where(and(eq(subjects.studentId, student.id), eq(subjects.schoolYearId, schoolYearId)));
  for (const r of rows) if (!ids.has(r.externalId)) ids.set(r.externalId, r.id);
  return ids;
}

/** The finals response as fetched, for mapStoredFinals; older releases kept the mapped list here instead (an array) */
export interface StoredFinalsResponse {
  endpoint: string;
  body: unknown;
}

/**
 * Finals from the API replace the API rows of this year; manual rows stay. `raw` is the response they came from, kept
 * in final_marks_raw (without it, the mapped list is kept, as before).
 */
export async function storeFinals(
  db: Db,
  student: StudentRow,
  calendar: StoredCalendar,
  subjectIds: Map<string, string>,
  list: FinalMark[],
  now: Date,
  raw: StoredFinalsResponse | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rawJson = raw ?? list;
    await tx
      .insert(finalMarksRaw)
      .values({ studentId: student.id, schoolYearId: calendar.schoolYearId, rawJson, fetchedAt: now })
      .onConflictDoUpdate({
        target: [finalMarksRaw.studentId, finalMarksRaw.schoolYearId],
        set: { rawJson, fetchedAt: now },
      });
    await writeFinals(tx, student.id, calendar, subjectIds, list, now);
  });
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The API rows of the year replaced by `list` (a fetch, or a stored response mapped again by a job) */
export async function writeFinals(
  tx: Tx,
  studentId: string,
  calendar: StoredCalendar,
  subjectIds: Map<string, string>,
  list: FinalMark[],
  now: Date,
): Promise<void> {
  const student = { id: studentId };
  // the API rows are replaced on every read; a final already seen with the same value keeps when it was first seen
  const before = await tx
    .select({
      subjectName: finalMarks.subjectName,
      periodId: finalMarks.periodId,
      raw: finalMarks.raw,
      firstSeenAt: finalMarks.firstSeenAt,
    })
    .from(finalMarks)
    .where(
      and(
        eq(finalMarks.studentId, student.id),
        eq(finalMarks.schoolYearId, calendar.schoolYearId),
        eq(finalMarks.source, 'api'),
      ),
    );
  const seenAt = (subjectName: string, periodId: string | null, raw: string) =>
    before.find((b) => b.subjectName === subjectName && b.periodId === periodId && b.raw === raw)?.firstSeenAt ?? now;
  await tx
    .delete(finalMarks)
    .where(
      and(
        eq(finalMarks.studentId, student.id),
        eq(finalMarks.schoolYearId, calendar.schoolYearId),
        eq(finalMarks.source, 'api'),
      ),
    );
  // a final for a term this calendar does not know would land on the year row: skipped until the calendar has it
  const known = list.filter((f) => f.termExternalId === null || calendar.termIds.has(f.termExternalId));
  const rows = known.map((f) => {
    const periodId = (f.termExternalId && calendar.termIds.get(f.termExternalId)) || null;
    return {
      studentId: student.id,
      schoolYearId: calendar.schoolYearId,
      subjectId: (f.subjectExternalId && subjectIds.get(f.subjectExternalId)) || null,
      subjectName: f.subjectName,
      periodId,
      role: f.role ?? 'final',
      label: f.label ?? null,
      date: f.date ?? null,
      raw: f.raw,
      mark: f.value,
      kind: f.kind,
      source: 'api' as const,
      updatedAt: now,
      firstSeenAt: seenAt(f.subjectName, periodId, f.raw),
    };
  });
  // a manual row for the same subject and period wins; the API row is dropped
  if (rows.length) await tx.insert(finalMarks).values(rows).onConflictDoNothing();
}
