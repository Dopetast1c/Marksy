import { estimateYear, periodStats } from '@marksy/core';
import type { ISODate, MarkFact } from '@marksy/core';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { finalMarks, schoolYears } from '../db/schema';
import { localTime } from '../sync/time';
import type { ChildContext, TermRow } from './context';

// Finals as the screens read them (docs/design.md 5.3, 5.3a, 5.3b): the state of the current term for the entry row
// («I четверть идёт, итоги после 31 окт» / «I четверть выставлена 15 октября»), the day a term's finals were posted,
// and the italic year value until the teacher posts the year final. A final is the teacher's; nothing here invents one.

export type FinalRow = typeof finalMarks.$inferSelect;

/** The finals of the child's current school year (term and year rows) */
export async function finalsOf(db: Db, ctx: ChildContext): Promise<FinalRow[]> {
  if (!ctx.year) return [];
  return db
    .select()
    .from(finalMarks)
    .where(
      and(
        eq(finalMarks.studentId, ctx.student.id),
        eq(finalMarks.schoolYearId, ctx.year.id),
        eq(finalMarks.role, 'final'),
      ),
    );
}

/** The day a final was posted: the diary's own date, else the school day Marksy first saw it */
export function postedOn(f: FinalRow, timezone: string): ISODate | null {
  if (f.date) return f.date;
  const at = f.firstSeenAt ?? (f.source === 'api' ? f.updatedAt : null);
  return at ? localTime(at, timezone).date : null;
}

export const termRef = (t: TermRow) => ({
  id: t.id,
  kind: t.kind,
  index: t.index,
  label: t.label,
  from: t.startDate,
  to: t.endDate,
});

export type FinalsState =
  /** the term runs; its finals come after its last day */
  | { state: 'running'; term: ReturnType<typeof termRef> }
  /** the term is over and its finals are not posted yet (the holidays before the next term) */
  | { state: 'ended'; term: ReturnType<typeof termRef> }
  /** the term's finals are posted and the next term has not started: news next to the current marks */
  | { state: 'posted'; term: ReturnType<typeof termRef>; postedOn: ISODate | null };

/**
 * The entry row's line. The term is the running one, else the last one that has ended; it is «posted» once any of its
 * finals is in, until the next term starts. null without terms or final marks, or before the first term.
 */
export function finalsState(ctx: ChildContext, finals: readonly FinalRow[]): FinalsState | null {
  if (!ctx.caps.terms || !ctx.caps.finalMarks || !ctx.termRows.length) return null;
  const running = ctx.termRows.find((t) => t.startDate <= ctx.today && ctx.today <= t.endDate);
  const ended = [...ctx.termRows].reverse().find((t) => t.endDate < ctx.today);
  const term = running ?? ended;
  if (!term) return null;
  const posted = finals.filter((f) => f.periodId === term.id);
  if (posted.length) {
    const days = posted.map((f) => postedOn(f, ctx.timezone)).filter((d): d is ISODate => d != null);
    return { state: 'posted', term: termRef(term), postedOn: days.length ? days.sort().at(-1)! : null };
  }
  return running ? { state: 'running', term: termRef(term) } : { state: 'ended', term: termRef(term) };
}

/**
 * Last school year's year finals by subject name ("итог 2025/26: 8" under a subject): subjects are matched across years
 * by the name the diary gives them (6.1). Synced or entered by hand.
 */
export async function lastYearFinals(db: Db, ctx: ChildContext) {
  if (!ctx.year) return null;
  const [prev] = await db
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.studentId, ctx.student.id), lt(schoolYears.startDate, ctx.year.startDate)))
    .orderBy(desc(schoolYears.startDate))
    .limit(1);
  if (!prev) return null;
  const rows = await db
    .select()
    .from(finalMarks)
    .where(
      and(
        eq(finalMarks.studentId, ctx.student.id),
        eq(finalMarks.schoolYearId, prev.id),
        isNull(finalMarks.periodId),
        eq(finalMarks.role, 'final'),
      ),
    );
  return {
    year: { id: prev.id, label: prev.label },
    byName: new Map(rows.map((r) => [r.subjectName, { raw: r.raw, value: r.mark, source: r.source }])),
  };
}

export type FinalCell =
  | { kind: 'final'; raw: string; value: number | null; postedOn: ISODate | null; source: 'api' | 'manual' }
  | { kind: 'running'; raw: null; value: number; postedOn: null; source: null }
  | { kind: 'none'; raw: null; value: null; postedOn: null; source: null };

const NONE: FinalCell = { kind: 'none', raw: null, value: null, postedOn: null, source: null };

const posted = (f: FinalRow, timezone: string): FinalCell => ({
  kind: 'final',
  raw: f.raw,
  value: f.mark,
  postedOn: postedOn(f, timezone),
  source: f.source,
});

/** A term cell of one subject: the posted final, else the running average of the term so far, a dash for a future term */
export function termCell(
  ctx: ChildContext,
  finals: readonly FinalRow[],
  facts: readonly MarkFact[],
  subjectId: string,
  t: TermRow,
): FinalCell {
  const f = finals.find((x) => x.subjectId === subjectId && x.periodId === t.id);
  if (f) return posted(f, ctx.timezone);
  if (t.startDate > ctx.today || !ctx.scale) return NONE;
  const avg = periodStats(
    ctx.scale,
    facts.filter((m) => m.subjectId === subjectId),
    { from: t.startDate, to: t.endDate < ctx.today ? t.endDate : ctx.today },
  ).average;
  return avg == null ? NONE : { kind: 'running', raw: null, value: avg, postedOn: null, source: null };
}

/**
 * The year cell: the teacher's year final, framed, only when the diary has it; until then the scale's year rule over
 * what is posted (by-10: the mean of the term finals so far), in italics as a calculation; a dash before the first one.
 */
export function yearCell(
  ctx: ChildContext,
  finals: readonly FinalRow[],
  facts: readonly MarkFact[],
  subjectId: string,
): FinalCell {
  const f = finals.find((x) => x.subjectId === subjectId && x.periodId === null);
  if (f) return posted(f, ctx.timezone);
  if (!ctx.scale) return NONE;
  const termFinals = ctx.termRows
    .map((t) => finals.find((x) => x.subjectId === subjectId && x.periodId === t.id)?.mark)
    .filter((v): v is number => v != null);
  const v = estimateYear(
    ctx.scale,
    termFinals,
    facts.filter((m) => m.subjectId === subjectId),
  );
  // a rule over marks still needs a posted term final first: the year value is never a guess from nothing
  return v == null || !termFinals.length
    ? NONE
    : { kind: 'running', raw: null, value: v, postedOn: null, source: null };
}
