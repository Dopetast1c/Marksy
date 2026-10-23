import { getProvider } from '@marksy/registry';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  attendance,
  families,
  familyStudents,
  finalMarks,
  holidays,
  lessonPrep,
  lessonPrepEvents,
  lessons,
  lessonTags,
  markEvents,
  memberships,
  marks,
  schoolYears,
  students,
  studentYears,
  studySessions,
  subjects,
  terms,
  users,
  userStudentAccess,
} from '../db/schema';
import { hashPassword } from '../auth/password';
import { fromLocal, localTime } from '../sync/time';
import { normName } from '../sync/upsert';
import type { Tx } from '../sync/upsert';
import { generateGrade1, generateGrade7, generateSessions, SEED_TAGS, seedCalendar } from '@marksy/demo-diary';
import type { SeedCalendar, SeedStudent } from '@marksy/demo-diary';

// `pnpm db:seed [--reset]`: the fictional demo family (docs/build-plan.md M3, "Data for testing"), two children on the
// fictional provider demo-full, one of them in a class without marks. No diary account is attached, so the planner
// never touches it. Re-running is safe: an existing demo family is left alone unless --reset replaces it.

export const DEMO_PROVIDER = 'demo-full';
export const DEMO_PASSWORD = 'marksy-demo';
export const DEMO_LOGINS = { parent: 'parent@example.com', student: 'student@example.com' } as const;

/**
 * The demo admin has a published password, so the seed only runs where nobody outside the home can sign in: PUBLIC_URL
 * unset, localhost or a private network address. A public instance needs --allow-public.
 */
export function seedAllowed(publicUrl: string | undefined): boolean {
  if (!publicUrl?.trim()) return true;
  let host: string;
  try {
    host = new URL(publicUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export interface SeedResult {
  created: boolean;
  familyId: string;
  counts: Record<string, number>;
}

async function demoFamilyId(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(users.login, DEMO_LOGINS.parent));
  return row?.familyId ?? null;
}

/**
 * Removes the demo family with its logins and the children only it follows. Children belong to no family, so deleting
 * the family alone would leave them behind (design.md 7.1: a child goes with the last link).
 */
async function removeDemoFamily(tx: Tx, familyId: string): Promise<void> {
  const linked = await tx
    .select({ studentId: familyStudents.studentId })
    .from(familyStudents)
    .where(eq(familyStudents.familyId, familyId));
  await tx.delete(families).where(eq(families.id, familyId));
  await tx.delete(users).where(inArray(users.login, Object.values(DEMO_LOGINS)));
  const ids = linked.map((l) => l.studentId);
  if (ids.length) {
    const stillFollowed = await tx
      .select({ studentId: familyStudents.studentId })
      .from(familyStudents)
      .where(inArray(familyStudents.studentId, ids));
    const orphans = ids.filter((id) => !stillFollowed.some((x) => x.studentId === id));
    if (orphans.length) await tx.delete(students).where(inArray(students.id, orphans));
  }
}

export async function seedDemo(db: Db, opts: { reset?: boolean; now?: Date } = {}): Promise<SeedResult> {
  const existing = await demoFamilyId(db);
  if (existing && !opts.reset) return { created: false, familyId: existing, counts: {} };
  const manifest = getProvider(DEMO_PROVIDER)!.manifest;
  const tz = manifest.timezone;
  const now = opts.now ?? new Date();
  const today = localTime(now, tz).date;
  // each child's own calendar: the February week is a holiday for grades 1 and 2 only
  const calendars = {
    k: seedCalendar(today, manifest.calendar.schoolDays, 7),
    m: seedCalendar(today, manifest.calendar.schoolDays, 1),
  };
  const kids = [generateGrade7(today, calendars.k), generateGrade1(today, calendars.m)];
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const counts: Record<string, number> = {};
  const count = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

  const familyId = await db.transaction(async (tx) => {
    if (existing) await removeDemoFamily(tx, existing);
    const [family] = await tx
      .insert(families)
      .values({ name: 'Демо-семья', settings: { guidance: true } })
      .returning();
    const fid = family!.id;
    const [parent, child] = await tx
      .insert(users)
      .values([
        { login: DEMO_LOGINS.parent, displayName: 'Мама', passwordHash },
        { login: DEMO_LOGINS.student, displayName: 'Милена', passwordHash },
      ])
      .returning();
    await tx.insert(memberships).values([
      { userId: parent!.id, familyId: fid, role: 'admin' },
      { userId: child!.id, familyId: fid, role: 'student' },
    ]);

    const studentIds: Record<string, string> = {};
    for (const kid of kids) {
      const id = await insertStudent(tx, kid, calendars[kid.key], count);
      studentIds[kid.key] = id.studentId;
      await tx
        .insert(familyStudents)
        .values({ familyId: fid, studentId: id.studentId, linkedBy: parent!.id, linkedAt: now });
      await insertDiary(tx, id, kid, calendars[kid.key], now, tz, count, child!.id);
    }
    await tx.insert(userStudentAccess).values([
      { userId: parent!.id, familyId: fid, studentId: studentIds.k! },
      { userId: parent!.id, familyId: fid, studentId: studentIds.m! },
      { userId: child!.id, familyId: fid, studentId: studentIds.k! },
    ]);
    await tx.insert(lessonTags).values(
      SEED_TAGS.map((t) => ({
        ...t,
        familyId: fid,
        createdBy: parent!.id,
        lessonTypes: t.lessonTypes ? [...t.lessonTypes] : null,
        keywords: [...t.keywords],
        fields: [...t.fields],
      })),
    );
    count('lesson_tags', SEED_TAGS.length);
    return fid;
  });
  return { created: true, familyId, counts };
}

interface StudentIds {
  studentId: string;
  yearId: string;
  termIds: Map<number, string>;
  subjectIds: Map<string, string>;
}

async function insertStudent(
  db: Tx,
  kid: SeedStudent,
  cal: SeedCalendar,
  count: (k: string, n: number) => void,
): Promise<StudentIds> {
  const [s] = await db
    .insert(students)
    .values({
      providerId: DEMO_PROVIDER,
      externalId: `demo-${kid.key}`,
      fullName: `${kid.familyName} ${kid.givenName}`,
      givenName: kid.givenName,
      familyName: kid.familyName,
      displayName: kid.givenName,
      schoolId: 'demo-school',
      classLabel: kid.classLabel,
      grade: kid.grade,
      gradingScaleId: kid.scale,
      avatar: kid.avatar,
    })
    .returning();
  const studentId = s!.id;
  const [year] = await db
    .insert(schoolYears)
    .values({
      studentId,
      providerId: DEMO_PROVIDER,
      externalId: cal.year.label,
      label: cal.year.label,
      startDate: cal.year.start,
      endDate: cal.year.end,
    })
    .returning();
  const yearId = year!.id;
  const termRows = await db
    .insert(terms)
    .values(
      cal.terms.map((t) => ({
        schoolYearId: yearId,
        externalId: `q${t.index}`,
        kind: 'quarter' as const,
        index: t.index,
        label: String(t.index),
        startDate: t.start,
        endDate: t.end,
      })),
    )
    .returning();
  await db
    .insert(holidays)
    .values(cal.holidays.map((h) => ({ schoolYearId: yearId, startDate: h.from, endDate: h.to })));
  await db.insert(studentYears).values({
    studentId,
    schoolYearId: yearId,
    classLabel: kid.classLabel,
    grade: kid.grade,
    gradingScaleId: kid.scale,
  });
  const subjectRows = await db
    .insert(subjects)
    .values(
      kid.subjects.map(({ name }, i) => ({
        studentId,
        schoolYearId: yearId,
        providerId: DEMO_PROVIDER,
        externalId: `${kid.key}-s${i}`,
        name,
        nameNorm: normName(name),
      })),
    )
    .returning();
  count('students', 1);
  count('subjects', subjectRows.length);
  return {
    studentId,
    yearId,
    termIds: new Map(termRows.map((t) => [t.index, t.id])),
    subjectIds: new Map(subjectRows.map((x) => [x.name, x.id])),
  };
}

async function insertDiary(
  db: Tx,
  ids: StudentIds,
  kid: SeedStudent,
  cal: SeedCalendar,
  now: Date,
  tz: string,
  count: (k: string, n: number) => void,
  studentUserId: string,
) {
  const { studentId } = ids;
  // the diary "saw" a lesson the evening before and a mark at 12:17 on its day
  const seenAt = (date: string, minutes: number) => {
    const at = fromLocal(date, minutes, tz);
    return at > now ? now : at;
  };
  const lessonIds = new Map<string, string>();
  for (let i = 0; i < kid.lessons.length; i += 500) {
    const chunk = kid.lessons.slice(i, i + 500);
    const rows = await db
      .insert(lessons)
      .values(
        chunk.map((l) => ({
          studentId,
          providerId: DEMO_PROVIDER,
          externalId: l.key,
          date: l.date,
          slot: l.slot,
          startTime: l.startTime,
          subjectId: ids.subjectIds.get(l.subject)!,
          subjectName: l.subject,
          lessonType: l.lessonType,
          topic: l.topic,
          homework: l.homework,
          firstSeenAt: seenAt(l.date, -5 * 60),
          fetchedAt: now,
        })),
      )
      .returning({ id: lessons.id, externalId: lessons.externalId });
    for (const r of rows) lessonIds.set(r.externalId, r.id);
  }
  count('lessons', kid.lessons.length);

  if (kid.marks.length) {
    const rows = await db
      .insert(marks)
      .values(
        kid.marks.map((m) => ({
          studentId,
          providerId: DEMO_PROVIDER,
          externalId: m.key,
          lessonId: lessonIds.get(m.lessonKey)!,
          date: m.date,
          subjectId: ids.subjectIds.get(m.subject)!,
          raw: m.raw,
          kind: m.kind,
          values: m.values,
          workType: m.workType,
          comment: m.comment,
          firstSeenAt: seenAt(m.date, 12 * 60 + 17),
          lastSeenAt: now,
        })),
      )
      .returning({ id: marks.id, date: marks.date, firstSeenAt: marks.firstSeenAt });
    // the feed's "new" events of the last two weeks
    const recent = rows.filter((r) => now.getTime() - r.firstSeenAt.getTime() < 14 * 86_400_000);
    if (recent.length) {
      await db
        .insert(markEvents)
        .values(recent.map((r) => ({ studentId, markId: r.id, kind: 'new' as const, createdAt: r.firstSeenAt })));
    }
    count('marks', rows.length);
  }
  if (kid.absences.length) {
    const lessonByKey = new Map(kid.lessons.map((l) => [l.key, l]));
    await db.insert(attendance).values(
      kid.absences.map((key) => {
        const l = lessonByKey.get(key)!;
        return {
          studentId,
          providerId: DEMO_PROVIDER,
          externalId: `att:${key}`,
          date: l.date,
          lessonId: lessonIds.get(key)!,
          subjectId: ids.subjectIds.get(l.subject)!,
          status: 'absent' as const,
          code: 'н',
          source: 'derived' as const,
          firstSeenAt: seenAt(l.date, 12 * 60 + 17),
        };
      }),
    );
    count('absences', kid.absences.length);
  }
  if (kid.finals.length) {
    await db.insert(finalMarks).values(
      kid.finals.map((f) => ({
        studentId,
        schoolYearId: ids.yearId,
        subjectId: ids.subjectIds.get(f.subject)!,
        subjectName: f.subject,
        periodId: ids.termIds.get(f.term)!,
        raw: String(f.value),
        mark: f.value,
        kind: 'numeric',
        source: 'api' as const,
      })),
    );
    count('final_marks', kid.finals.length);
  }

  // study sessions, and the "готово" ticks they end with
  const sessions = generateSessions(kid, localTime(now, tz).date, cal);
  if (sessions.length) {
    await db.insert(studySessions).values(
      sessions.map((s) => {
        const startedAt = fromLocal(s.date, s.start, tz);
        return {
          studentId,
          subjectId: ids.subjectIds.get(s.subject)!,
          lessonId: s.lessonKey ? lessonIds.get(s.lessonKey)! : null,
          kind: s.kind,
          source: s.source,
          startedAt,
          endedAt: new Date(startedAt.getTime() + s.minutes * 60_000),
          activeSec: s.minutes * 60,
          createdBy: s.source === 'timer' ? studentUserId : null,
        };
      }),
    );
    const ticks = new Map<string, Date>();
    for (const s of sessions) if (s.lessonKey) ticks.set(s.lessonKey, fromLocal(s.date, s.start + s.minutes, tz));
    const prep = [...ticks].map(([key, at]) => ({
      studentId,
      lessonId: lessonIds.get(key)!,
      doneAt: at,
      doneBy: studentUserId,
    }));
    await db.insert(lessonPrep).values(prep);
    await db
      .insert(lessonPrepEvents)
      .values(
        prep.map((p) => ({ studentId, lessonId: p.lessonId, kind: 'done' as const, by: studentUserId, at: p.doneAt })),
      );
    count('study_sessions', sessions.length);
    count('lesson_prep', prep.length);
  }
}

/** For tests: the children the demo family follows */
export async function demoStudents(db: Db) {
  const familyId = await demoFamilyId(db);
  if (!familyId) return [];
  const rows = await db
    .select({ student: students })
    .from(familyStudents)
    .innerJoin(students, eq(students.id, familyStudents.studentId))
    .where(eq(familyStudents.familyId, familyId));
  return rows.map((r) => r.student);
}
