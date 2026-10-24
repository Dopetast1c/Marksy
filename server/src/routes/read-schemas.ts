import { activeBands, termKind } from '@marksy/core';
import type { BandRole, GradingScale, PeriodStats, Term } from '@marksy/core';
import { z } from 'zod';
import { registry } from '../openapi';
import type { ResolvedPeriod } from '../students/context';

// The shapes the read routes share (docs/design.md 9, "Shapes worth fixing now"): a mark chip, a period, a
// comparison, the band distribution on the child's scale. Every number a screen shows comes from here; the words
// from the app's i18n.

export const markChip = registry.register(
  'MarkChip',
  z.object({
    id: z.string(),
    values: z.array(z.number()),
    raw: z.string(),
    kind: z.string(),
    /** The band on the child's scale; never the only signal, the number or raw text is always shown */
    band: z.enum(['critical', 'low', 'good', 'top']).nullable(),
  }),
);

export const subjectRef = z.object({ id: z.string(), name: z.string() });

export const periodOut = registry.register(
  'Period',
  z.object({
    kind: z.enum(['week', 'month', 'term', 'year', 'custom']),
    offset: z.number(),
    from: z.string(),
    to: z.string(),
    end: z.string(),
    /** The diary's own name of the term, shown as it is */
    termLabel: z.string().nullable(),
    /** What a term is called comes from its kind through the app's words (CLAUDE.md, "четверть"), never typed */
    termKind: termKind.nullable(),
    termIndex: z.number().nullable(),
  }),
);

export const periodOf = (p: ResolvedPeriod) =>
  instanceOut({ ...p, ...(p.instance?.term && { term: p.instance.term }) });

/** One instance of the navigator, as every read route sends it (with the term's kind and number for its label) */
export const instanceOut = (i: {
  kind: string;
  offset: number;
  from: string;
  to: string;
  end: string;
  term?: Term;
}) => ({
  kind: i.kind as z.infer<typeof periodOut>['kind'],
  offset: i.offset,
  from: i.from,
  to: i.to,
  end: i.end,
  termLabel: i.term?.label ?? null,
  termKind: i.term?.kind ?? null,
  termIndex: i.term?.index ?? null,
});

export const comparison = registry.register(
  'Comparison',
  z.object({
    current: z.enum(['marks', 'empty']),
    previous: z.enum(['marks', 'empty', 'none']),
    average: z.number().nullable(),
    prevAverage: z.number().nullable(),
    delta: z.number().nullable(),
    trend: z.enum(['up', 'down', 'flat']).nullable(),
  }),
);

export const bandCount = registry.register(
  'BandCount',
  z.object({
    band: z.enum(['critical', 'low', 'good', 'top']),
    /** i18n key of the band's label, from the scale */
    labelKey: z.string(),
    from: z.number(),
    to: z.number(),
    count: z.number(),
  }),
);

/** The bands of the child's scale with their counts: never fixed ranges (design.md 9, D53) */
export function bandsOf(scale: GradingScale, stats: PeriodStats) {
  return activeBands(scale).map((band: BandRole) => {
    const b = scale.bands[band]!;
    return { band, labelKey: b.labelKey, from: b.from, to: b.to, count: stats.bands[band] };
  });
}

export const childEvent = registry.register(
  'ChildEvent',
  z.object({
    kind: z.enum([
      'low_mark',
      'mark_changed',
      'mark_removed',
      'absence',
      'average_down',
      'average_up',
      'teacher_comment',
      'holidays_ahead',
    ]),
    severity: z.enum(['critical', 'low', 'neutral', 'good']),
    date: z.string(),
    subject: subjectRef.nullable(),
    facts: z.record(z.string(), z.unknown()),
    link: z.object({
      screen: z.enum(['subject', 'schedule', 'school']),
      subjectId: z.string().optional(),
      lessonId: z.string().nullable().optional(),
      date: z.string().optional(),
    }),
  }),
);

export const nowLine = registry.register(
  'NowLine',
  z.discriminatedUnion('state', [
    z.object({ state: z.literal('before'), slot: z.number().nullable(), at: z.string() }),
    z.object({ state: z.literal('lesson'), slot: z.number().nullable(), subjectName: z.string(), until: z.string() }),
    z.object({ state: z.literal('break'), slot: z.number().nullable(), subjectName: z.string(), at: z.string() }),
    z.object({ state: z.literal('done'), at: z.string() }),
  ]),
);

export const lessonOut = registry.register(
  'Lesson',
  z.object({
    id: z.string(),
    date: z.string(),
    slot: z.number().nullable(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    subjectId: z.string(),
    subjectName: z.string(),
    teacherName: z.string().nullable(),
    room: z.string().nullable(),
    groupLabel: z.string().nullable(),
    lessonType: z.string().nullable(),
    topic: z.string().nullable(),
    homework: z.string().nullable(),
    homeworkDueDate: z.string().nullable(),
    hasAttachments: z.boolean(),
    cancelled: z.boolean(),
    /** «готово»: who, only for this family's members; another family's act is otherFamily (design.md 7.1) */
    ready: z
      .object({
        at: z.date(),
        by: z.object({ name: z.string().nullable(), otherFamily: z.boolean() }).nullable(),
      })
      .nullable(),
    ownHomework: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        by: z.object({ name: z.string().nullable(), otherFamily: z.boolean() }).nullable(),
      }),
    ),
    marks: z.array(markChip),
    absent: z.boolean(),
    /** The teacher's comment without a mark (D56); null without one or without capabilities.behaviour */
    teacherComment: z.string().nullable(),
  }),
);
