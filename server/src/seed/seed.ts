import { getProvider } from '@marksy/registry';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  alertRules,
  attendance,
  bellSchedules,
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
  weekTemplates,
} from '../db/schema';
import { hashPassword } from '../auth/password';
import { rulesForMember } from '../family/rules';
import { fromLocal, localTime } from '../sync/time';
import { followKey } from '../sync/sources';
import { normName } from '../sync/upsert';
import type { Tx } from '../sync/upsert';
import {
  generateGrade1,
  generateGrade7,
  generateSessions,
  SEED_TAGS,
  seedCalendar,
  weekTemplateOf,
} from '@marksy/demo-diary';
import type { ProviderManifest } from '@marksy/core';
import { notifyAdmins } from '../notify/admin';
import { insertDemoDiaries } from './demo-sync';
import type { DemoDiaryChild } from './demo-sync';
import type { SeedCalendar, SeedStudent } from '@marksy/demo-diary';

// `pnpm db:seed [--reset]`: the fictional demo family (docs/build-plan.md M3, M3a, "Data for testing"), matching the
// prototype: Милена in grade 7 on the fictional demo-full diary with her bells, subgroups, teachers and rooms; Марк in
// grade 1, a class without marks, at another school on the thinner demo-lite diary; and a second fictional family that
// also follows Марк (parents who live apart, ux-principles D54). Each child's diary has a fictional login with a run
// history, verified weeks and a drift notice (demo-sync.ts), but no credentials, so the planner never reads it. A past
// year typed in from a report card and a student with a wallpaper complete the states of the prototype. Re-running is
// safe: the demo families are left alone unless --reset replaces them.

/** Each demo child's fictional diary (the prototype's «Марк в другой школе, другой дневник») */
export const DEMO_PROVIDERS = { k: 'demo-full', m: 'demo-lite' } as const;
export const DEMO_PASSWORD = 'marksy-demo';
export const DEMO_LOGINS = {
  parent: 'parent@example.com',
  student: 'student@example.com',
  /** the parent of the second family, who follows Марк too */
  otherParent: 'parent2@example.com',
} as const;

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
 * Removes the demo families with their logins; the children only they follow go with them (design.md 7.1: a child goes
 * with the last link, a trigger of migration 0004).
 */
async function removeDemoFamilies(tx: Tx): Promise<void> {
  const demo = await tx
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(users.login, Object.values(DEMO_LOGINS)));
  const familyIds = [...new Set(demo.map((d) => d.familyId))];
  if (familyIds.length === 0) return;
  await tx.delete(families).where(inArray(families.id, familyIds));
  await tx.delete(users).where(inArray(users.login, Object.values(DEMO_LOGINS)));
}

export async function seedDemo(db: Db, opts: { reset?: boolean; now?: Date } = {}): Promise<SeedResult> {
  const existing = await demoFamilyId(db);
  if (existing && !opts.reset) return { created: false, familyId: existing, counts: {} };
  const manifests = { k: getProvider(DEMO_PROVIDERS.k)!.manifest, m: getProvider(DEMO_PROVIDERS.m)!.manifest };
  const tz = manifests.k.timezone;
  const now = opts.now ?? new Date();
  const today = localTime(now, tz).date;
  // each child's own calendar: the February week is a holiday for grades 1 and 2 only
  const calendars = {
    k: seedCalendar(today, manifests.k.calendar.schoolDays, 7),
    m: seedCalendar(today, manifests.m.calendar.schoolDays, 1),
  };
  const kids = [generateGrade7(today, calendars.k), generateGrade1(today, calendars.m)];
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const counts: Record<string, number> = {};
  const count = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

  const familyId = await db.transaction(async (tx) => {
    if (existing) await removeDemoFamilies(tx);
    const [family] = await tx
      .insert(families)
      .values({ name: 'Демо-семья', settings: { guidance: true } })
      .returning();
    const fid = family!.id;
    const [parent, child] = await tx
      .insert(users)
      .values([
        { login: DEMO_LOGINS.parent, displayName: 'Мама', passwordHash },
        // the student has picked a wallpaper (Оформление, design.md 5.6a): the parent keeps the plain background
        {
          login: DEMO_LOGINS.student,
          displayName: 'Милена',
          passwordHash,
          settings: { appearance: { background: 'wallpaper', wallpaper: 'doodle' } },
        },
      ])
      .returning();
    await tx.insert(memberships).values([
      { userId: parent!.id, familyId: fid, role: 'admin' },
      { userId: child!.id, familyId: fid, role: 'student' },
    ]);

    const studentIds: Record<string, string> = {};
    const diaries: DemoDiaryChild[] = [];
    for (const kid of kids) {
      const id = await insertStudent(tx, kid, calendars[kid.key], manifests[kid.key], count);
      studentIds[kid.key] = id.studentId;
      diaries.push({ kid, cal: calendars[kid.key], manifest: manifests[kid.key], ...id });
      if (kid.scale) await insertTypedYear(tx, id, kid, calendars[kid.key], parent!.id, count);
      await tx
        .insert(familyStudents)
        .values({ familyId: fid, studentId: id.studentId, linkedBy: parent!.id, linkedAt: now });
      // a child ticks and times only their own lessons (6.5): Милена has her own login, Марк's are Мама's
      const actor = kid.key === 'k' ? child!.id : parent!.id;
      await insertDiary(tx, id, kid, calendars[kid.key], manifests[kid.key], now, tz, count, actor);
    }
    await insertDemoDiaries(tx, { familyId: fid, parentId: parent!.id, children: diaries, now }, count);
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

    // a second household that follows Марк too: its own parent and nothing else of the first family
    const [other] = await tx.insert(families).values({ name: 'Вторая демо-семья', settings: {} }).returning();
    const [otherParent] = await tx
      .insert(users)
      .values({ login: DEMO_LOGINS.otherParent, displayName: 'Папа', passwordHash })
      .returning();
    await tx.insert(memberships).values({ userId: otherParent!.id, familyId: other!.id, role: 'admin' });
    await tx
      .insert(familyStudents)
      .values({ familyId: other!.id, studentId: studentIds.m!, linkedBy: otherParent!.id, linkedAt: now });
    await tx
      .insert(userStudentAccess)
      .values({ userId: otherParent!.id, familyId: other!.id, studentId: studentIds.m! });
    count('families', 2);
    return { fid, otherId: other!.id, markId: studentIds.m! };
  });
  // the first family hears of it as it would from the collector (sources.ts linkFamily): once, without names
  await notifyAdmins(db, familyId.fid, {
    eventKey: followKey(familyId.markId, familyId.otherId),
    severity: 'info',
    title: 'notification.childFollowed.title',
    body: 'notification.childFollowed.body',
    params: { child: 'Марк' },
    link: '/family',
  });
  // the default notification rules of every member about every child they see, as on joining (design.md 7.1, 11)
  const members = await db
    .select({ userId: memberships.userId, familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(inArray(memberships.familyId, [familyId.fid, familyId.otherId]));
  for (const m of members) await rulesForMember(db, m.userId, m.familyId, m.role);
  count('alert_rules', (await db.select({ id: alertRules.id }).from(alertRules)).length);
  return { created: true, familyId: familyId.fid, counts };
}

interface StudentIds {
  studentId: string;
  yearId: string;
  termIds: Map<number, string>;
  subjectIds: Map<string, string>;
  providerId: string;
  caps: ProviderManifest['capabilities'];
}

async function insertStudent(
  db: Tx,
  kid: SeedStudent,
  cal: SeedCalendar,
  manifest: ProviderManifest,
  count: (k: string, n: number) => void,
): Promise<StudentIds> {
  const providerId = manifest.id;
  const caps = manifest.capabilities;
  const [s] = await db
    .insert(students)
    .values({
      providerId,
      externalId: `demo-${kid.key}`,
      fullName: `${kid.familyName} ${kid.givenName}`,
      givenName: kid.givenName,
      familyName: kid.familyName,
      displayName: kid.givenName,
      schoolId: `demo-school-${kid.key}`,
      schoolLabel: kid.key === 'm' ? 'Гимназия № 2' : 'СШ № 34',
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
      providerId,
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
        note: t.note ?? null,
      })),
    )
    .returning();
  await db.insert(holidays).values(
    cal.holidays.map((h) => ({
      schoolYearId: yearId,
      startDate: h.from,
      endDate: h.to,
      note: h.note ?? null,
      kind: h.kind,
    })),
  );
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
      kid.subjects.map((sub, i) => ({
        studentId,
        schoolYearId: yearId,
        providerId,
        externalId: `${kid.key}-s${i}`,
        name: sub.name,
        nameNorm: normName(sub.name),
        // what the child's diary shows, as far as its capabilities go (providers.md 10)
        teacherName: caps.teacherNames ? sub.teacher : null,
        groupLabel: caps.teachingGroups ? sub.group : null,
        level: sub.level ? 'advanced' : 'regular',
        levelLabel: sub.level ?? 'Базовый',
        lessonsPerWeek: sub.slots.length,
      })),
    )
    .returning();
  count('students', 1);
  count('subjects', subjectRows.length);
  const subjectIds = new Map(subjectRows.map((x) => [x.name, x.id]));
  if (caps.bellSchedule) {
    await db.insert(bellSchedules).values({
      studentId,
      schoolYearId: yearId,
      externalId: `bells-${kid.key}`,
      label: kid.bells.label,
      days: kid.bells.days,
      periods: kid.bells.periods,
      fetchedAt: new Date(),
    });
    count('bell_schedules', 1);
  }
  if (caps.weekTemplate) {
    const entries = weekTemplateOf(kid).map((e) => ({
      cycle_week: 1,
      weekday: e.weekday,
      slot: e.slot,
      ...(kid.bells.periods.find((p) => p.slot === e.slot) && {
        start: kid.bells.periods.find((p) => p.slot === e.slot)!.start,
        end: kid.bells.periods.find((p) => p.slot === e.slot)!.end,
      }),
      subject_id: subjectIds.get(e.subject)!,
      ...(caps.teachingGroups && e.group && { group_label: e.group }),
      ...(caps.rooms && e.room && { room: e.room }),
      ...(caps.teacherNames && e.teacher && { teacher_name: e.teacher }),
      template_ref: e.templateRef,
    }));
    await db.insert(weekTemplates).values({ studentId, termId: null, cycleWeeks: 1, entries, fetchedAt: new Date() });
    count('week_templates', 1);
  }
  return {
    studentId,
    yearId,
    termIds: new Map(termRows.map((t) => [t.index, t.id])),
    subjectIds,
    providerId,
    caps,
  };
}

async function insertDiary(
  db: Tx,
  ids: StudentIds,
  kid: SeedStudent,
  cal: SeedCalendar,
  _manifest: ProviderManifest,
  now: Date,
  tz: string,
  count: (k: string, n: number) => void,
  actorUserId: string,
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
          providerId: ids.providerId,
          externalId: l.key,
          date: l.date,
          slot: l.slot,
          startTime: l.startTime,
          subjectId: ids.subjectIds.get(l.subject)!,
          subjectName: l.subject,
          endTime: l.endTime,
          room: ids.caps.rooms ? l.room : null,
          groupLabel: ids.caps.teachingGroups ? l.groupLabel : null,
          teacherName: ids.caps.teacherNames ? (kid.subjects.find((x) => x.name === l.subject)?.teacher ?? null) : null,
          templateRef: l.templateRef,
          lessonType: ids.caps.lessonTypes ? l.lessonType : null,
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
          providerId: ids.providerId,
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
          providerId: ids.providerId,
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
        // posted on the term's last day, seen in the afternoon read
        firstSeenAt: seenAt(cal.terms.find((t) => t.index === f.term)!.end, 15 * 60),
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
          createdBy: s.source === 'timer' ? actorUserId : null,
        };
      }),
    );
    const ticks = new Map<string, Date>();
    for (const s of sessions) if (s.lessonKey) ticks.set(s.lessonKey, fromLocal(s.date, s.start + s.minutes, tz));
    const prep = [...ticks].map(([key, at]) => ({
      studentId,
      lessonId: lessonIds.get(key)!,
      doneAt: at,
      doneBy: actorUserId,
    }));
    await db.insert(lessonPrep).values(prep);
    await db
      .insert(lessonPrepEvents)
      .values(
        prep.map((p) => ({ studentId, lessonId: p.lessonId, kind: 'done' as const, by: actorUserId, at: p.doneAt })),
      );
    count('study_sessions', sessions.length);
    count('lesson_prep', prep.length);
  }
}

/**
 * The school year before the diary's, typed in from the paper report card (Итоги → Годы, design.md 5.3b): stored as
 * PUT /api/students/:id/final-marks stores it (students/manual-finals.ts), with «введено вручную».
 */
async function insertTypedYear(
  db: Tx,
  ids: StudentIds,
  kid: SeedStudent,
  cal: SeedCalendar,
  enteredBy: string,
  count: (k: string, n: number) => void,
) {
  const back = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  const startYear = Number(cal.year.start.slice(0, 4)) - 1;
  const [year] = await db
    .insert(schoolYears)
    .values({
      studentId: ids.studentId,
      providerId: 'manual',
      externalId: `manual:${startYear}`,
      label: cal.year.label.replace(/\d{4}/g, (y) => String(Number(y) - 1)),
      startDate: back(cal.year.start),
      endDate: back(cal.year.end),
      source: 'manual',
    })
    .returning();
  const typed = kid.subjects.map((sub) => sub.name);
  await db.insert(finalMarks).values(
    typed.map((subjectName, i) => {
      const mark = [8, 7, 9, 6, 8, 7, 10, 7][i % 8]!;
      return {
        studentId: ids.studentId,
        schoolYearId: year!.id,
        subjectName,
        periodId: null,
        role: 'final',
        raw: String(mark),
        mark,
        kind: 'numeric',
        source: 'manual' as const,
        enteredBy,
      };
    }),
  );
  count('final_marks', typed.length);
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
