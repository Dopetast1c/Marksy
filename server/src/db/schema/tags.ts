import { boolean, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, day, id, ts } from './columns';
import { families, students, users } from './family';
import { lessons } from './diary';

// Tags: the family's words for what kind of work a lesson needs (docs/design.md 6.3). Matching fills lesson_tag_hits
// at sync (M6); tags never notify by themselves.

export const lessonTags = pgTable(
  'lesson_tags',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    icon: text('icon'),
    tone: text('tone', { enum: ['normal', 'important'] })
      .notNull()
      .default('normal'),
    keywords: text('keywords').array().notNull().default([]),
    fields: text('fields').array().notNull().default(['topic', 'homework']),
    lessonTypes: text('lesson_types').array(),
    subjectNames: text('subject_names').array().notNull().default([]),
    /** null = every student */
    studentIds: uuid('student_ids').array(),
    prepDays: integer('prep_days'),
    enabled: boolean('enabled').notNull().default(true),
    presetKey: text('preset_key'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('lesson_tags_family_idx').on(t.familyId)],
);

export const lessonTagHits = pgTable(
  'lesson_tag_hits',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => lessonTags.id, { onDelete: 'cascade' }),
    sourceLessonId: uuid('source_lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    dueLessonId: uuid('due_lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    dueDate: day('due_date').notNull(),
    field: text('field', { enum: ['topic', 'homework', 'type'] }).notNull(),
    snippet: text('snippet'),
    createdAt: createdAt(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    unique('lesson_tag_hits_tag_due_key').on(t.tagId, t.dueLessonId),
    index('lesson_tag_hits_student_due_idx').on(t.studentId, t.dueDate),
  ],
);
