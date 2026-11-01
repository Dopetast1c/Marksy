import { average, bandOf, lessonHint, lessonPassed } from '@marksy/core';
import type { DateRange, GuidanceLesson, Hint, LessonType } from '@marksy/core';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { lessonOverrides, lessons } from '../db/schema';
import type { ChildContext } from './context';
import { chipOf, factOf, guidanceMark, marksIn } from './data';

// What Timetable (screen.schedule) says under an upcoming lesson beyond the diary's own rows (docs/design.md 5.5, D38):
// the lesson notes facts (the subject's average this school year, its last five marks, when the last one was given
// and how many lessons ago, as of the lesson), signal ("No mark for a while" (lesson.signal.call) / "Needs a push"
// (lesson.signal.push), a family rule, guidance on) and hint (6.2, guidance on). The tag notes are in students/tags.ts. A passed lesson keeps only its mark, so it gets none of this.

type LessonLike = { id: string; date: string; end: string | null; subjectId: string; cancelled: boolean };

export interface LessonFacts {
  average: number | null;
  last: ReturnType<typeof chipOf>[];
  lastDate: string;
  /** Lessons of the subject since the last mark that took place (a cancelled one is skipped) */
  since: number;
}

export interface LessonNotes {
  /** null: no mark in the subject this school year yet ("No marks in this subject this year yet", lesson.facts.none) */
  facts: LessonFacts | null;
  signal: { kind: 'call' | 'callLow' | 'push'; lessons: number; average: number | null } | null;
  hint: Hint | null;
}

/**
 * The notes of the lessons that have not passed, by lesson id. Nothing for a year without marks (no scale) or before
 * the first sync. `isTest` comes from the family's test tag (CLAUDE.md), never from the diary's types.
 */
export async function lessonNotes(
  db: Db,
  ctx: ChildContext,
  range: DateRange,
  rows: readonly (LessonLike & { lessonType: string | null; homework: string | null; topic: string | null })[],
  isTest: (lessonId: string) => boolean,
): Promise<Map<string, LessonNotes>> {
  const out = new Map<string, LessonNotes>();
  const { scale, year } = ctx;
  const ahead = rows.filter((l) => !l.cancelled && !lessonPassed(l, ctx.now, ctx.timezone));
  if (!scale || !year || !ahead.length) return out;
  const upTo = { from: year.startDate, to: range.to };
  const [marks, past, overrides] = await Promise.all([
    marksIn(db, ctx.student.id, upTo),
    db
      .select({ id: lessons.id, date: lessons.date, subjectId: lessons.subjectId, cancelled: lessons.cancelled })
      .from(lessons)
      .where(
        and(
          eq(lessons.studentId, ctx.student.id),
          isNull(lessons.removedAt),
          gte(lessons.date, upTo.from),
          lte(lessons.date, upTo.to),
        ),
      )
      .orderBy(asc(lessons.date)),
    db
      .select({ lessonId: lessonOverrides.lessonId })
      .from(lessonOverrides)
      .where(and(eq(lessonOverrides.studentId, ctx.student.id), eq(lessonOverrides.cancelled, true))),
  ]);
  const numeric = marks.filter((m) => m.values.length);
  const off = new Set(overrides.map((o) => o.lessonId));
  const marked = new Set(numeric.map((m) => m.lessonId).filter(Boolean));
  const held = past.filter((l) => !l.cancelled && (!off.has(l.id) || marked.has(l.id)));

  for (const l of ahead) {
    // as of the start of the lesson: the marks of earlier days, this school year only (never last year's)
    const before = numeric
      .filter((m) => m.subjectId === l.subjectId && m.date < l.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = before.at(-1);
    const facts: LessonFacts | null = last
      ? {
          average: average(scale, before.map(factOf)),
          last: before.slice(-5).map((m) => chipOf(scale, m)),
          lastDate: last.date,
          since: held.filter((x) => x.subjectId === l.subjectId && x.date > last.date && x.date < l.date).length,
        }
      : null;
    let signal: LessonNotes['signal'] = null;
    let hint: Hint | null = null;
    if (ctx.guidance && ctx.rules) {
      const term =
        ctx.termRows.find((t) => t.startDate <= l.date && l.date <= t.endDate) ??
        ctx.termRows.find((t) => t.startDate <= ctx.today && ctx.today <= t.endDate);
      const termMarks = numeric.filter(
        (m) => m.subjectId === l.subjectId && (!term || (m.date >= term.startDate && m.date <= term.endDate)),
      );
      const lesson: GuidanceLesson = {
        id: l.id,
        date: l.date,
        subjectId: l.subjectId,
        isTest: isTest(l.id),
        ...(l.lessonType && { lessonType: l.lessonType as LessonType }),
        hasHomework: !!l.homework,
        ...(l.topic && { topic: l.topic }),
      };
      hint = lessonHint({ scale, rules: ctx.rules, caps: ctx.caps, lesson, termMarks: termMarks.map(guidanceMark) });
      const band = facts?.average != null ? bandOf(scale, facts.average) : null;
      const lowAvg = band === 'critical' || band === 'low';
      if (facts && facts.since >= ctx.rules.callAfter)
        signal = { kind: lowAvg ? 'callLow' : 'call', lessons: facts.since, average: facts.average };
      else if (facts && lowAvg && !(hint && (hint.severity === 'low' || hint.severity === 'critical')))
        signal = { kind: 'push', lessons: facts.since, average: facts.average };
    }
    out.set(l.id, { facts, signal, hint });
  }
  return out;
}
