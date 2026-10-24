import { defaultFamilyRules, periodInstance } from '@marksy/core';
import type {
  Capabilities,
  FamilyRules,
  GradingScale,
  ISODate,
  PeriodContext,
  PeriodInstance,
  PeriodKind,
  ProviderManifest,
  Term,
} from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Request } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client';
import {
  families,
  familyStudents,
  holidays,
  schoolYears,
  students,
  subjectColors,
  terms,
  users,
  userStudentAccess,
} from '../db/schema';
import type { AppDeps } from '../http/context';
import { memberOf } from '../http/context';
import { HttpError } from '../http/errors';
import { localTime } from '../sync/time';
import { studentScale } from './scale';

// One child as a read route sees them (docs/design.md 6, 7.6): reached only through an active family_students link of
// the current family and the person's own access, with the child's provider, capabilities, scale, the family's rules
// on that scale, and the calendar every period is cut from, in the child's time zone.

export type StudentRow = typeof students.$inferSelect;
export type TermRow = typeof terms.$inferSelect;
export type YearRow = typeof schoolYears.$inferSelect;

export interface ChildContext {
  student: StudentRow;
  familyId: string;
  userId: string;
  role: 'admin' | 'parent' | 'student';
  manifest: ProviderManifest;
  caps: Capabilities;
  /** null: a year without marks (ux-principles D49) */
  scale: GradingScale | null;
  rules: FamilyRules | null;
  timezone: string;
  now: Date;
  today: ISODate;
  /** The current school year (the one containing today, else the latest), null before the first sync */
  year: YearRow | null;
  termRows: TermRow[];
  holidayRows: { start: ISODate; end: ISODate; note: string | null }[];
  period: PeriodContext;
  /** The family's subject colours (6.6): a palette key per subject; a subject not in the map is «авто» */
  colors: Map<string, string | null>;
  /** Advice on (families.settings.guidance and the person's own switch, both on unless turned off): goals and hints */
  guidance: boolean;
}

/** The child of a /api/students/:id/* route, or 404 (never telling whether the child exists elsewhere) */
export async function loadChild(deps: AppDeps, req: Request, studentId: string): Promise<ChildContext> {
  const m = memberOf(req);
  const { db } = deps;
  const [row] = await db
    .select({ student: students, settings: familyStudents.settings })
    .from(students)
    .innerJoin(
      familyStudents,
      and(
        eq(familyStudents.studentId, students.id),
        eq(familyStudents.familyId, m.familyId),
        eq(familyStudents.status, 'active'),
      ),
    )
    .innerJoin(
      userStudentAccess,
      and(
        eq(userStudentAccess.studentId, students.id),
        eq(userStudentAccess.familyId, m.familyId),
        eq(userStudentAccess.userId, m.userId),
      ),
    )
    .where(eq(students.id, studentId));
  const manifest = row && getProvider(row.student.providerId)?.manifest;
  if (!row || !manifest) throw new HttpError(404, 'not_found', 'No such child');
  const now = deps.now?.() ?? new Date();
  const timezone = row.student.timezone ?? manifest.timezone;
  const today = localTime(now, timezone).date;
  const scale = await studentScale(db, studentId);
  const s = row.settings;
  const rules = scale && {
    ...defaultFamilyRules(scale),
    ...(s.low_mark != null && { lowMarkBelow: s.low_mark }),
    ...(s.drop_step != null && { dropStep: s.drop_step }),
    ...(s.call_after != null && { callAfter: s.call_after }),
  };
  const [{ year, past, termRows, holidayRows }, colorRows, [prefs]] = await Promise.all([
    calendarOf(db, studentId, today),
    db
      .select({ subjectId: subjectColors.subjectId, color: subjectColors.color })
      .from(subjectColors)
      .where(eq(subjectColors.studentId, studentId)),
    db
      .select({ family: families.settings, user: users.settings })
      .from(families)
      .innerJoin(users, eq(users.id, m.userId))
      .where(eq(families.id, m.familyId)),
  ]);
  return {
    student: row.student,
    familyId: m.familyId,
    userId: m.userId,
    role: m.role,
    manifest,
    caps: manifest.capabilities,
    scale,
    rules,
    timezone,
    now,
    today,
    year,
    termRows,
    holidayRows,
    period: {
      today,
      weekStart: manifest.calendar.weekStart,
      schoolYear: year ? { from: year.startDate, to: year.endDate } : { from: today, to: today },
      terms: termRows.map(termOf),
      pastYears: past.map((y) => ({ from: y.startDate, to: y.endDate })),
    },
    colors: new Map(colorRows.map((r) => [r.subjectId, r.color])),
    guidance: prefs?.family.guidance !== false && prefs?.user.guidance !== false,
  };
}

export const termOf = (t: TermRow): Term => ({
  externalId: t.externalId,
  kind: t.kind,
  index: t.index,
  label: t.label,
  start: t.startDate,
  end: t.endDate,
  ...(t.note && { note: t.note }),
});

async function calendarOf(db: Db, studentId: string, today: ISODate) {
  const years = await db
    .select()
    .from(schoolYears)
    .where(eq(schoolYears.studentId, studentId))
    .orderBy(desc(schoolYears.startDate));
  const year = years.find((y) => y.startDate <= today && today <= y.endDate) ?? years[0] ?? null;
  const past = years.filter((y) => year && y.startDate < year.startDate);
  const termRows = year
    ? await db.select().from(terms).where(eq(terms.schoolYearId, year.id)).orderBy(asc(terms.index))
    : [];
  const holidayRows = year
    ? (
        await db
          .select({ start: holidays.startDate, end: holidays.endDate, note: holidays.note })
          .from(holidays)
          .where(inArray(holidays.schoolYearId, [year.id]))
          .orderBy(asc(holidays.startDate))
      ).map((h) => ({ start: h.start, end: h.end, note: h.note }))
    : [];
  return { year, past, termRows, holidayRows };
}

/** ?period=week|month|quarter|year&offset=N, or ?from=&to= (design.md 9); `quarter` is the term kind */
export const periodQuery = z.object({
  period: z.enum(['week', 'month', 'quarter', 'term', 'year']).default('week'),
  offset: z.coerce.number().int().min(0).max(400).default(0),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export interface ResolvedPeriod {
  kind: PeriodKind | 'custom';
  offset: number;
  from: ISODate;
  to: ISODate;
  /** The whole instance (a current one runs past today) */
  end: ISODate;
  instance: PeriodInstance | null;
}

export function resolvePeriod(
  ctx: ChildContext,
  q: z.infer<typeof periodQuery>,
  use: 'marks' | 'lessons' = 'marks',
): ResolvedPeriod {
  if (q.from && q.to) {
    if (q.from > q.to) throw new HttpError(400, 'invalid_request', 'from must not be after to');
    return { kind: 'custom', offset: 0, from: q.from, to: q.to, end: q.to, instance: null };
  }
  const kind: PeriodKind = q.period === 'quarter' ? 'term' : q.period;
  const instance = periodInstance(ctx.period, kind, q.offset, use);
  if (!instance) throw new HttpError(404, 'no_such_period', 'This period does not exist for the child');
  return { kind, offset: q.offset, from: instance.from, to: instance.to, end: instance.end, instance };
}
