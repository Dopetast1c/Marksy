import { markBand, previousInstance } from '@marksy/core';
import type { DateRange, GradingScale, MarkFact } from '@marksy/core';
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  attendance,
  behaviourEvents,
  homeworkItems,
  lessonOverrides,
  lessonPrep,
  lessons,
  marks,
  memberships,
  subjects,
  users,
} from '../db/schema';
import type { ChildContext, ResolvedPeriod } from './context';

// What a read route needs of one child, always as the diary has it now: removed rows are left out (their history is
// the feed's business), facts a capability does not promise are empty. Every query is by the child (child-owned rows,
// design.md 7.1); the access check happened in loadChild.

export type MarkRow = Awaited<ReturnType<typeof marksIn>>[number];

/** The marks of a range (or all of them), with the subject's name and the lesson's topic */
export async function marksIn(db: Db, studentId: string, range?: DateRange) {
  return db
    .select({
      id: marks.id,
      date: marks.date,
      subjectId: marks.subjectId,
      subjectName: subjects.name,
      raw: marks.raw,
      kind: marks.kind,
      values: marks.values,
      weight: marks.weight,
      workType: marks.workType,
      workTypeRaw: marks.workTypeRaw,
      comment: marks.comment,
      lessonId: marks.lessonId,
      topic: lessons.topic,
      firstSeenAt: marks.firstSeenAt,
      changedAt: marks.changedAt,
    })
    .from(marks)
    .innerJoin(subjects, eq(subjects.id, marks.subjectId))
    .leftJoin(lessons, eq(lessons.id, marks.lessonId))
    .where(
      and(
        eq(marks.studentId, studentId),
        isNull(marks.removedAt),
        range ? gte(marks.date, range.from) : undefined,
        range ? lte(marks.date, range.to) : undefined,
      ),
    )
    .orderBy(desc(marks.date), desc(marks.firstSeenAt));
}

/** The maths' view of a mark: values, weight, date, subject */
export const factOf = (m: MarkRow): MarkFact => ({
  date: m.date,
  subjectId: m.subjectId,
  values: m.values,
  ...(m.weight != null && { weight: m.weight }),
});

/** A mark as a chip: the values, the text the diary shows, its kind and band on the child's scale */
export function chipOf(scale: GradingScale | null, m: Pick<MarkRow, 'id' | 'values' | 'raw' | 'kind'>) {
  return { id: m.id, values: m.values, raw: m.raw, kind: m.kind, band: scale ? markBand(scale, m.values) : null };
}

export type RemarkRow = Awaited<ReturnType<typeof remarksIn>>[number];

/**
 * The teacher's comments on lessons without a mark (D56) in a range: only where the provider has behaviour; never
 * marks, never in an average or a band
 */
export async function remarksIn(db: Db, ctx: ChildContext, range?: DateRange) {
  if (ctx.caps.behaviour === 'none') return [];
  return db
    .select({
      id: behaviourEvents.id,
      date: behaviourEvents.date,
      text: behaviourEvents.comment,
      subjectId: behaviourEvents.subjectId,
      subjectName: subjects.name,
      lessonId: behaviourEvents.lessonId,
      slot: lessons.slot,
      firstSeenAt: behaviourEvents.firstSeenAt,
    })
    .from(behaviourEvents)
    .leftJoin(subjects, eq(subjects.id, behaviourEvents.subjectId))
    .leftJoin(lessons, eq(lessons.id, behaviourEvents.lessonId))
    .where(
      and(
        eq(behaviourEvents.studentId, ctx.student.id),
        eq(behaviourEvents.category, 'lesson_comment'),
        isNull(behaviourEvents.removedAt),
        range ? gte(behaviourEvents.date, range.from) : undefined,
        range ? lte(behaviourEvents.date, range.to) : undefined,
      ),
    )
    .orderBy(desc(behaviourEvents.date), desc(behaviourEvents.firstSeenAt));
}

/** Absences of a range: only where the provider has attendance */
export async function absencesIn(db: Db, ctx: ChildContext, range: DateRange) {
  if (ctx.caps.attendance === 'none') return [];
  return db
    .select({
      id: attendance.id,
      date: attendance.date,
      status: attendance.status,
      excused: attendance.excused,
      code: attendance.code,
      subjectId: attendance.subjectId,
      subjectName: subjects.name,
      lessonId: attendance.lessonId,
    })
    .from(attendance)
    .leftJoin(subjects, eq(subjects.id, attendance.subjectId))
    .where(
      and(
        eq(attendance.studentId, ctx.student.id),
        isNull(attendance.removedAt),
        gte(attendance.date, range.from),
        lte(attendance.date, range.to),
      ),
    )
    .orderBy(desc(attendance.date));
}

/** The subjects of the current school year, with the child's teacher, group, level and lessons per week */
export async function subjectsOf(db: Db, ctx: ChildContext) {
  if (!ctx.year) return [];
  return db
    .select()
    .from(subjects)
    .where(and(eq(subjects.studentId, ctx.student.id), eq(subjects.schoolYearId, ctx.year.id)))
    .orderBy(asc(subjects.name));
}

export const subjectInfo = (s: typeof subjects.$inferSelect) => ({
  id: s.id,
  name: s.name,
  shortName: s.shortName,
  teacherName: s.teacherName,
  groupLabel: s.groupLabel,
  level: s.level,
  levelLabel: s.levelLabel,
  lessonsPerWeek: s.lessonsPerWeek,
});

/**
 * The lessons of a range with everything the schedule shows: «готово» (the author's name only for this family's
 * members, design.md 7.1), «урока не будет», own homework, the teacher's comment
 */
export async function lessonsIn(db: Db, ctx: ChildContext, range: DateRange) {
  const rows = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.studentId, ctx.student.id),
        isNull(lessons.removedAt),
        gte(lessons.date, range.from),
        lte(lessons.date, range.to),
      ),
    )
    .orderBy(asc(lessons.date), asc(lessons.slot), asc(lessons.startTime));
  const ids = rows.map((l) => l.id);
  if (!ids.length) return [];
  const [prep, overrides, own, people] = await Promise.all([
    db.select().from(lessonPrep).where(inArray(lessonPrep.lessonId, ids)),
    db.select().from(lessonOverrides).where(inArray(lessonOverrides.lessonId, ids)),
    db
      .select()
      .from(homeworkItems)
      .where(
        and(inArray(homeworkItems.lessonId, ids), eq(homeworkItems.source, 'manual'), isNull(homeworkItems.removedAt)),
      ),
    db
      .select({ userId: users.id, displayName: users.displayName, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.familyId, ctx.familyId)),
  ]);
  const remarks = await remarksIn(db, ctx, range);
  const lessonMarks = (await marksIn(db, ctx.student.id, range)).filter((m) => m.lessonId);
  const absences = await absencesIn(db, ctx, range);
  // an act of this family's member shows their name; the child's own and the other family's do not name anyone
  const who = (userId: string | null) => {
    if (!userId) return null;
    const p = people.find((x) => x.userId === userId);
    return p ? { name: p.displayName, otherFamily: false } : { name: null, otherFamily: true };
  };
  return rows.map((l) => {
    const p = prep.find((x) => x.lessonId === l.id);
    const o = overrides.find((x) => x.lessonId === l.id);
    return {
      id: l.id,
      date: l.date,
      slot: l.slot,
      start: l.startTime,
      end: l.endTime,
      subjectId: l.subjectId,
      subjectName: l.subjectName,
      teacherName: l.teacherName,
      room: l.room,
      groupLabel: l.groupLabel,
      lessonType: l.lessonType,
      topic: l.topic,
      homework: l.homework,
      homeworkDueDate: l.homeworkDueDate,
      hasAttachments: l.hasAttachments,
      // the diary's own cancellation, or «Урока не будет» set in the family
      cancelled: l.cancelled || !!o?.cancelled,
      ready: p ? { at: p.doneAt, by: who(p.doneBy) } : null,
      ownHomework: own
        .filter((h) => h.lessonId === l.id)
        .map((h) => ({ id: h.id, text: h.title, by: who(h.createdBy) })),
      marks: lessonMarks.filter((m) => m.lessonId === l.id).map((m) => chipOf(ctx.scale, m)),
      absent: absences.some((a) => a.lessonId === l.id),
      teacherComment: remarks.find((r) => r.lessonId === l.id)?.text ?? null,
    };
  });
}

/**
 * The two tiles of a year without marks (design.md 5.2, D49): lessons and homework in the selected instance and in the
 * one before. Lessons are planned ahead, so an instance counts to its end, not to today. Cancelled lessons do not count.
 */
export async function lessonCounts(db: Db, ctx: ChildContext, p: ResolvedPeriod) {
  const count = async (range: DateRange) => {
    const ls = (await lessonsIn(db, ctx, range)).filter((l) => !l.cancelled);
    return { lessons: ls.length, homework: ls.filter((l) => l.homework || l.ownHomework.length).length };
  };
  const cur = await count({ from: p.from, to: p.end });
  const before = p.instance ? previousInstance(ctx.period, p.instance, 'lessons') : null;
  const prev = before ? await count({ from: before.from, to: before.end }) : null;
  return { ...cur, prevLessons: prev?.lessons ?? null, prevHomework: prev?.homework ?? null };
}
