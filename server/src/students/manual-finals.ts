import { scaleValues } from '@marksy/core';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { finalMarks, schoolYears } from '../db/schema';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import type { ChildContext } from './context';

// Year finals of school years before Marksy (docs/design.md 6.1, 5.3b): typed in by the admin or a parent from the
// paper report card, kept with source = manual and shown with «введено вручную». The diary's own years are never
// written over: a year the diary sends is not a year to type in. The values are the child's scale's (a past year on
// another scale is entered on today's, the Годы table says when the scales differ).

/** How far back a year may be typed in: the whole of school, and no further */
const MAX_YEARS_BACK = 11;
const PROVIDER = 'manual';

export const manualFinalsIn = z.object({
  /** The calendar year the school year starts in («2025» for 2025-2026) */
  startYear: z.number().int(),
  /** The whole year as it should be: subjects left out lose their typed final; an empty list removes the year */
  marks: z
    .array(z.object({ subjectName: z.string().trim().min(1).max(80), raw: z.string().trim().min(1).max(8) }))
    .max(40),
});

const yearOf = (date: string) => Number(date.slice(0, 4));
/** The same day of the year, `years` earlier (29 February becomes the 28th) */
function shiftYears(date: string, years: number): string {
  const y = yearOf(date) - years;
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5);
  return `${String(y).padStart(4, '0')}-${md}`;
}

/** The label of a past year in the current year's own form: «2026-2027» gives «2023-2024» */
function labelOf(current: string, back: number): string {
  return current.replace(/\d{4}/g, (y) => String(Number(y) - back));
}

export async function putManualFinals(
  deps: AppDeps,
  ctx: ChildContext,
  userId: string,
  input: z.infer<typeof manualFinalsIn>,
): Promise<{ yearId: string | null; count: number }> {
  const scale = ctx.scale;
  const current = ctx.year;
  if (!scale || !current) throw new HttpError(400, 'no_scale', 'This child has no marks to enter finals on');
  const back = yearOf(current.startDate) - input.startYear;
  if (back < 1 || back > MAX_YEARS_BACK)
    throw new HttpError(400, 'not_a_past_year', 'Only a school year before the current one can be typed in');
  const startDate = shiftYears(current.startDate, back);
  const endDate = shiftYears(current.endDate, back);
  const years = await deps.db.select().from(schoolYears).where(eq(schoolYears.studentId, ctx.student.id));
  // the diary's years stay the diary's
  if (years.some((y) => y.source === 'api' && y.startDate <= endDate && startDate <= y.endDate))
    throw new HttpError(409, 'year_from_diary', 'The diary has this school year');
  const values = new Set(scaleValues(scale));
  const marks = input.marks.map((m) => {
    const v = Number(m.raw.replace(',', '.'));
    if (!values.has(v)) throw new HttpError(400, 'not_on_scale', `${m.raw} is not a mark of this scale`);
    return { subjectName: m.subjectName, raw: String(v), mark: v };
  });
  if (new Set(marks.map((m) => m.subjectName.toLocaleLowerCase())).size !== marks.length)
    throw new HttpError(400, 'duplicate_subject', 'A subject is listed twice');

  const externalId = `manual:${input.startYear}`;
  return deps.db.transaction(async (tx) => {
    let year = years.find((y) => y.providerId === PROVIDER && y.externalId === externalId);
    if (year)
      await tx
        .delete(finalMarks)
        .where(and(eq(finalMarks.schoolYearId, year.id), eq(finalMarks.source, 'manual'), isNull(finalMarks.periodId)));
    if (!marks.length) {
      if (year) await tx.delete(schoolYears).where(eq(schoolYears.id, year.id));
      return { yearId: null, count: 0 };
    }
    if (!year)
      [year] = await tx
        .insert(schoolYears)
        .values({
          studentId: ctx.student.id,
          providerId: PROVIDER,
          externalId,
          label: labelOf(current.label, back),
          startDate,
          endDate,
          source: 'manual',
        })
        .returning();
    await tx.insert(finalMarks).values(
      marks.map((m) => ({
        studentId: ctx.student.id,
        schoolYearId: year!.id,
        subjectName: m.subjectName,
        periodId: null,
        role: 'final',
        raw: m.raw,
        mark: m.mark,
        kind: 'numeric',
        source: 'manual' as const,
        enteredBy: userId,
      })),
    );
    return { yearId: year!.id, count: marks.length };
  });
}
