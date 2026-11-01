import { activeBands, distributionBuckets, termKind } from '@marksy/core';
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

/** A subject on a row: its family colour is a palette key of docs/tokens.json, null for "auto" (color.auto, design.md 6.6) */
export const subjectRef = z.object({ id: z.string(), name: z.string(), color: z.string().nullable() });

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
    /** What a term is called comes from its kind through the app's words (CLAUDE.md, "quarter", term.quarter), never typed */
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
    /** The same band in the instance before ("was N", stat.was); null when there is no instance before */
    prevCount: z.number().nullable(),
  }),
);

/** The bands of the child's scale with their counts: never fixed ranges (design.md 9, D53) */
export function bandsOf(scale: GradingScale, stats: PeriodStats, prev: PeriodStats | null = null) {
  return activeBands(scale).map((band: BandRole) => {
    const b = scale.bands[band]!;
    return {
      band,
      labelKey: b.labelKey,
      from: b.from,
      to: b.to,
      count: stats.bands[band],
      prevCount: prev ? prev.bands[band] : null,
    };
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
      'account_action',
    ]),
    severity: z.enum(['critical', 'low', 'neutral', 'good']),
    date: z.string(),
    subject: subjectRef.nullable(),
    facts: z.record(z.string(), z.unknown()),
    link: z.object({
      screen: z.enum(['subject', 'schedule', 'school', 'sync']),
      subjectId: z.string().optional(),
      lessonId: z.string().nullable().optional(),
      date: z.string().optional(),
    }),
  }),
);

const nowLesson = { slot: z.number().nullable(), subjectName: z.string(), room: z.string().nullable() };

export const nowLine = registry.register(
  'NowLine',
  z.discriminatedUnion('state', [
    z.object({ ...nowLesson, state: z.literal('before'), at: z.string() }),
    z.object({ ...nowLesson, state: z.literal('lesson'), until: z.string() }),
    z.object({ ...nowLesson, state: z.literal('break'), at: z.string() }),
    z.object({
      state: z.literal('done'),
      at: z.string(),
      /** the next school day's first lesson ("tomorrow from 08:00", nowCard.tomorrowAt) */
      next: z.object({ date: z.string(), at: z.string() }).nullable(),
    }),
  ]),
);

/** The distribution card (DistCard): one bucket per value of the child's scale, with its count */
export const distributionOut = z.array(z.object({ from: z.number(), to: z.number(), count: z.number() }));
export function distributionOf(scale: GradingScale, values: readonly number[]) {
  return distributionBuckets(scale).map((b) => ({
    ...b,
    count: values.filter((v) => v >= b.from && v <= b.to).length,
  }));
}

/** A family tag as a lesson shows it (6.3): its name, line icon and tone (important: orange) */
export const tagRefOut = registry.register(
  'TagRef',
  z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    tone: z.enum(['normal', 'important']),
    presetKey: z.string().nullable(),
  }),
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
    subjectColor: z.string().nullable(),
    teacherName: z.string().nullable(),
    room: z.string().nullable(),
    groupLabel: z.string().nullable(),
    lessonType: z.string().nullable(),
    topic: z.string().nullable(),
    homework: z.string().nullable(),
    homeworkDueDate: z.string().nullable(),
    hasAttachments: z.boolean(),
    cancelled: z.boolean(),
    /** "Ready" (lesson.ready): who, only for this family's members; another family's act is otherFamily (design.md 7.1) */
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
    /** The marks of the lesson; the kind of work and the teacher's comment only when the diary set them (D50) */
    marks: z.array(markChip.extend({ workType: z.string().nullable(), comment: z.string().nullable() })),
    absent: z.boolean(),
    /** The teacher's comment without a mark (D56); null without one or without capabilities.behaviour */
    teacherComment: z.string().nullable(),
    /** The family's tags due at this lesson (the tag note, 6.3); a homework hit carries the text and the day it was set */
    tags: z.array(
      z.object({
        tag: tagRefOut,
        field: z.enum(['topic', 'homework', 'type']),
        snippet: z.string().nullable(),
        setOn: z.string().nullable(),
      }),
    ),
    /** Tagged homework set at this lesson for a later one ("Set: Poem, for Tue, 20 Oct", lesson.taggedHomework) */
    setHere: z.array(z.object({ tag: tagRefOut, dueDate: z.string() })),
    /** Carries the family's test tag ("Test"): what every "is this a test" asks (CLAUDE.md), never the diary's type alone */
    isTest: z.boolean(),
  }),
);

/** A term as the finals show it: its kind and number name it through i18n ("Quarter I", period.termN), its dates under the head */
export const termRefOut = registry.register(
  'TermRef',
  z.object({
    id: z.string(),
    kind: termKind,
    index: z.number(),
    label: z.string(),
    from: z.string(),
    to: z.string(),
  }),
);

/** The finals entry row on Marks and Subjects (screen.marks, screen.subjects; design.md 5.3): a running term, an ended one, or posted finals */
export const finalsStateOut = registry.register(
  'FinalsState',
  z.discriminatedUnion('state', [
    z.object({ state: z.literal('running'), term: termRefOut }),
    z.object({ state: z.literal('ended'), term: termRefOut }),
    z.object({ state: z.literal('posted'), term: termRefOut, postedOn: z.string().nullable() }),
  ]),
);

/**
 * One cell of Finals (finals.screen, 5.3b): the teacher's final (framed), or a calculation in italics (the running term's average, the
 * year's value by the scale's year rule over the term finals posted so far), or a dash
 */
export const finalCellOut = registry.register(
  'FinalCell',
  z.object({
    kind: z.enum(['final', 'running', 'none']),
    raw: z.string().nullable(),
    value: z.number().nullable(),
    postedOn: z.string().nullable(),
    /** a final entered by hand from the paper report card is shown with "entered by hand" (finals.manual.cell) */
    source: z.enum(['api', 'manual']).nullable(),
  }),
);

const hintText = z.object({
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
});

/** A guidance hint (6.2): the fact and the advice as i18n keys with raw scale values the app formats */
export const hintOut = registry.register(
  'Hint',
  z.object({
    rule: z.string(),
    severity: z.enum(['critical', 'low', 'ok', 'good']),
    fact: hintText,
    advice: hintText.optional(),
    lessonId: z.string().optional(),
    date: z.string().optional(),
  }),
);
