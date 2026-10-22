import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, day, id, ts } from './columns';
import { families, students, users } from './family';
import { schoolYears, subjects, terms } from './school';

// What the diary says: lessons, marks, attendance, homework, finals (docs/design.md 8). Rows are upserted by the
// collector (server/src/sync/upsert.ts); nothing here is ever deleted by a sync, only soft-removed (removed_at).

const familyRef = () =>
  uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' });
const studentRef = () =>
  uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' });

export const lessons = pgTable(
  'lessons',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    date: day('date').notNull(),
    slot: integer('slot'),
    startTime: text('start_time'),
    endTime: text('end_time'),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    teacherExternalId: text('teacher_external_id'),
    teacherName: text('teacher_name'),
    lessonType: text('lesson_type'),
    topic: text('topic'),
    homework: text('homework'),
    homeworkDueDate: day('homework_due_date'),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    cancelled: boolean('cancelled').notNull().default(false),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    unique('lessons_student_external_key').on(t.studentId, t.providerId, t.externalId),
    index('lessons_student_date_idx').on(t.studentId, t.date),
    index('lessons_family_idx').on(t.familyId),
  ],
);

export const marks = pgTable(
  'marks',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    date: day('date').notNull(),
    postedAt: day('posted_at'),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Exactly what the diary shows: "8", "7/9", "зач." */
    raw: text('raw').notNull(),
    kind: text('kind', { enum: ['numeric', 'pass', 'fail', 'exempt', 'not_assessed', 'other'] }).notNull(),
    values: doublePrecision('values').array().notNull().default([]),
    scaleId: text('scale_id'),
    workType: text('work_type'),
    workTypeRaw: text('work_type_raw'),
    title: text('title'),
    assessmentType: text('assessment_type'),
    dimension: text('dimension'),
    criterion: text('criterion'),
    weight: real('weight'),
    maxPoints: real('max_points'),
    modifier: text('modifier'),
    status: text('status'),
    cohort: jsonb('cohort').$type<Record<string, unknown>>(),
    comment: text('comment'),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    changedAt: ts('changed_at'),
    removedAt: ts('removed_at'),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [
    unique('marks_student_external_key').on(t.studentId, t.providerId, t.externalId),
    index('marks_student_date_idx').on(t.studentId, t.date),
    index('marks_lesson_idx').on(t.lessonId),
    index('marks_family_idx').on(t.familyId),
  ],
);

/** Attendance is never a mark: averages do not see it (CLAUDE.md, "Provider boundary") */
export const attendance = pgTable(
  'attendance',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    date: day('date').notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['absent', 'late', 'left_early', 'present_other'] }).notNull(),
    excused: boolean('excused'),
    code: text('code'),
    minutes: integer('minutes'),
    reason: text('reason'),
    source: text('source', { enum: ['separate', 'derived'] }).notNull(),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    unique('attendance_student_external_key').on(t.studentId, t.providerId, t.externalId),
    index('attendance_student_date_idx').on(t.studentId, t.date),
  ],
);

export const homeworkItems = pgTable(
  'homework_items',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    providerId: text('provider_id'),
    /** null for items the family added (source manual) */
    externalId: text('external_id'),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    setDate: day('set_date'),
    dueDate: day('due_date'),
    source: text('source', { enum: ['diary', 'manual'] }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    markId: uuid('mark_id').references(() => marks.id, { onDelete: 'set null' }),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    uniqueIndex('homework_items_student_external_key')
      .on(t.studentId, t.providerId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    index('homework_items_student_due_idx').on(t.studentId, t.dueDate),
  ],
);

export const behaviourEvents = pgTable(
  'behaviour_events',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    date: day('date').notNull(),
    points: real('points'),
    polarity: text('polarity', { enum: ['positive', 'negative', 'neutral'] }).notNull(),
    category: text('category'),
    comment: text('comment'),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    removedAt: ts('removed_at'),
  },
  (t) => [unique('behaviour_events_student_external_key').on(t.studentId, t.providerId, t.externalId)],
);

/** Previous versions of a mark; kept for the lifetime of the mark (docs/design.md 10.4) */
export const markHistory = pgTable(
  'mark_history',
  {
    id: id(),
    markId: uuid('mark_id')
      .notNull()
      .references(() => marks.id, { onDelete: 'cascade' }),
    seenAt: ts('seen_at').notNull(),
    rawMark: text('raw_mark').notNull(),
    kind: text('kind').notNull(),
    workType: text('work_type'),
    comment: text('comment'),
  },
  (t) => [index('mark_history_mark_idx').on(t.markId)],
);

export interface MarkDiff {
  raw?: [string, string];
  kind?: [string, string];
  workType?: [string | null, string | null];
  comment?: [string | null, string | null];
}

export const markEvents = pgTable(
  'mark_events',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    markId: uuid('mark_id')
      .notNull()
      .references(() => marks.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['new', 'changed', 'removed', 'restored'] }).notNull(),
    diff: jsonb('diff').$type<MarkDiff>(),
    createdAt: createdAt(),
    notifiedAt: ts('notified_at'),
  },
  (t) => [
    index('mark_events_student_created_idx').on(t.studentId, t.createdAt),
    index('mark_events_created_idx').on(t.createdAt),
  ],
);

export const finalMarksRaw = pgTable(
  'final_marks_raw',
  {
    studentId: studentRef(),
    familyId: familyRef(),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    rawJson: jsonb('raw_json').notNull(),
    fetchedAt: ts('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.schoolYearId] })],
);

export const finalMarks = pgTable(
  'final_marks',
  {
    id: id(),
    familyId: familyRef(),
    studentId: studentRef(),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    /** null for manual rows with no subject in the diary */
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    /** The term; null = the year final */
    periodId: uuid('period_id').references(() => terms.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('final'),
    criterion: text('criterion'),
    label: text('label'),
    date: day('date'),
    /** What the diary shows */
    raw: text('raw').notNull(),
    mark: doublePrecision('mark'),
    kind: text('kind').notNull(),
    source: text('source', { enum: ['api', 'manual'] }).notNull(),
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('final_marks_student_year_subject_period_key')
      .on(t.studentId, t.schoolYearId, t.subjectName, t.periodId)
      .nullsNotDistinct(),
  ],
);
