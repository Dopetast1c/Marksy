import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, ts } from './columns';
import { families, students, users } from './family';
import { lessons } from './diary';
import { subjects } from './school';

// What the family does around lessons: "готово" ticks, "урока не будет", study sessions (docs/design.md 5.5, 6.5,
// 6.7). These rows belong to the family, not to the diary: a lesson keeps them when its external id changes.

const studentRef = () =>
  uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' });
const lessonRef = () =>
  uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' });

export const lessonPrep = pgTable(
  'lesson_prep',
  {
    studentId: studentRef(),
    lessonId: lessonRef(),
    doneAt: ts('done_at').notNull(),
    doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.lessonId] })],
);

export const lessonPrepEvents = pgTable(
  'lesson_prep_events',
  {
    id: id(),
    studentId: studentRef(),
    lessonId: lessonRef(),
    kind: text('kind', { enum: ['done', 'undone'] }).notNull(),
    by: uuid('by').references(() => users.id, { onDelete: 'set null' }),
    at: ts('at').notNull(),
  },
  (t) => [
    index('lesson_prep_events_student_at_idx').on(t.studentId, t.at),
    index('lesson_prep_events_at_idx').on(t.at),
  ],
);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['homework', 'review'] }).notNull(),
    /** inferred rows are estimates from ticks, recomputed and replaced, shown with ≈ (docs/design.md 6.7) */
    source: text('source', { enum: ['timer', 'inferred', 'manual'] }).notNull(),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    activeSec: integer('active_sec').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    inferredFrom: jsonb('inferred_from').$type<string[]>(),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('study_sessions_student_started_idx').on(t.studentId, t.startedAt)],
);

export const studySessionEvents = pgTable(
  'study_session_events',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => studySessions.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['start', 'pause', 'resume', 'stop'] }).notNull(),
    at: ts('at').notNull(),
  },
  (t) => [index('study_session_events_session_idx').on(t.sessionId), index('study_session_events_at_idx').on(t.at)],
);

/** "Урока не будет"; dropped when the diary records a mark or an absence for the lesson (docs/design.md 5.5) */
export const lessonOverrides = pgTable(
  'lesson_overrides',
  {
    studentId: studentRef(),
    lessonId: lessonRef(),
    cancelled: boolean('cancelled').notNull(),
    setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
    setAt: ts('set_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.lessonId] })],
);
