import { index, integer, jsonb, pgTable, primaryKey, real, text, unique, uuid } from 'drizzle-orm/pg-core';
import { day, id, ts } from './columns';
import { students, users } from './family';

// School structure per student: years, terms, holidays, subjects (docs/design.md 8). Filled from the provider's
// calendar and subject list on every run; ids from the source live in external_id.

export const schoolYears = pgTable(
  'school_years',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    label: text('label').notNull(),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    source: text('source', { enum: ['api', 'manual'] })
      .notNull()
      .default('api'),
  },
  (t) => [unique('school_years_student_external_key').on(t.studentId, t.providerId, t.externalId)],
);

export const terms = pgTable(
  'terms',
  {
    id: id(),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    kind: text('kind', { enum: ['quarter', 'trimester', 'semester', 'other'] }).notNull(),
    index: integer('index').notNull(),
    label: text('label').notNull(),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    /** The system's remark (dates that differ for some grades), shown as it is */
    note: text('note'),
  },
  (t) => [unique('terms_year_external_key').on(t.schoolYearId, t.externalId)],
);

export const holidays = pgTable(
  'holidays',
  {
    id: id(),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    note: text('note'),
  },
  (t) => [unique('holidays_year_range_key').on(t.schoolYearId, t.startDate, t.endDate)],
);

export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    /** Lowercased, whitespace-collapsed name: matching across years and tag subject filters */
    nameNorm: text('name_norm').notNull(),
    shortName: text('short_name'),
    /** The student's own teacher (of their group on a split subject) */
    teacherExternalId: text('teacher_external_id'),
    teacherName: text('teacher_name'),
    groupLabel: text('group_label'),
    level: text('level'),
    levelLabel: text('level_label'),
    lessonsPerWeek: real('lessons_per_week'),
    credits: real('credits'),
    gradingScheme: jsonb('grading_scheme').$type<Record<string, unknown>>(),
  },
  (t) => [unique('subjects_student_year_external_key').on(t.studentId, t.schoolYearId, t.providerId, t.externalId)],
);

/** Manual mapping of one subject across years */
export const subjectLinks = pgTable(
  'subject_links',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    fromSubjectId: uuid('from_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    toSubjectId: uuid('to_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.fromSubjectId, t.toSubjectId] })],
);

export const subjectColors = pgTable(
  'subject_colors',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** A palette key from docs/tokens.json; null = automatic */
    color: text('color'),
    setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.subjectId] })],
);

export const subjectGoals = pgTable(
  'subject_goals',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Any value of the student's scale; null = без цели */
    termGoal: text('term_goal'),
    setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.subjectId] })],
);

export const studentYears = pgTable(
  'student_years',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    classLabel: text('class_label'),
    grade: integer('grade'),
    /**
     * The scale of this year (packages/core studentYearScale): a built-in scale id, MANIFEST_SCALE for the manifest's
     * inline scale, or null for a year without marks.
     */
    gradingScaleId: text('grading_scale_id'),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.schoolYearId] }), index('student_years_year_idx').on(t.schoolYearId)],
);

export interface BellPeriod {
  slot: number;
  start: string;
  end: string;
}

/** The bells of the student's class (providers.md BellSchedule), replaced on every fetch */
export const bellSchedules = pgTable(
  'bell_schedules',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    schoolYearId: uuid('school_year_id')
      .notNull()
      .references(() => schoolYears.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    label: text('label'),
    /** 0 = Sunday, as manifest.calendar */
    days: integer('days').array().notNull(),
    periods: jsonb('periods').$type<BellPeriod[]>().notNull(),
    validFrom: day('valid_from'),
    validTo: day('valid_to'),
    fetchedAt: ts('fetched_at').notNull(),
  },
  (t) => [index('bell_schedules_student_idx').on(t.studentId)],
);

export interface WeekTemplateEntry {
  cycle_week: number;
  weekday: number;
  slot: number;
  start?: string;
  end?: string;
  subject_id: string;
  group_label?: string;
  room?: string;
  teacher_external_id?: string;
  teacher_name?: string;
  template_ref?: string;
}

/** The student's own regular week for a term; never another group's lessons. Replaced on every fetch */
export const weekTemplates = pgTable(
  'week_templates',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** null = the whole year */
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'cascade' }),
    cycleWeeks: integer('cycle_weeks').notNull().default(1),
    entries: jsonb('entries').$type<WeekTemplateEntry[]>().notNull(),
    fetchedAt: ts('fetched_at').notNull(),
  },
  (t) => [index('week_templates_student_idx').on(t.studentId)],
);

/** student_years.grading_scale_id when the manifest's scale is inline rather than a built-in id */
export const MANIFEST_SCALE = 'manifest';
