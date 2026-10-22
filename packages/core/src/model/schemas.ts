import { z } from 'zod';

// The canonical model (docs/providers.md section 4). Every provider maps its system onto these types and nothing else;
// server and web never see a provider's own field names. Everything beyond the minimum is optional and announced
// through manifest capabilities, so a missing field means "the system has no such thing", never an error.

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export type ISODate = z.infer<typeof isoDate>;

export const dateRange = z.object({ from: isoDate, to: isoDate });
/** Inclusive range of calendar days. */
export type DateRange = z.infer<typeof dateRange>;

const nonEmpty = z.string().min(1);

export const studentRef = z.object({
  externalId: nonEmpty,
  fullName: nonEmpty,
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  middleName: z.string().optional(),
  displayName: z.string().optional(),
  schoolId: z.string().optional(),
  /** The class or year group in the system, when its URLs or data need it */
  classExternalId: z.string().optional(),
  className: z.string().optional(),
  grade: z.number().int().optional(),
  gradeLabel: z.string().optional(),
});
export type StudentRef = z.infer<typeof studentRef>;

export const accountInfo = z.object({
  externalUserId: nonEmpty,
  displayName: z.string().nullable(),
  role: z.enum(['parent', 'student']),
  students: z.array(studentRef),
});
export type AccountInfo = z.infer<typeof accountInfo>;

export const termKind = z.enum(['quarter', 'trimester', 'semester', 'other']);
export type TermKind = z.infer<typeof termKind>;

export const term = z.object({
  externalId: nonEmpty,
  kind: termKind,
  index: z.number().int().min(1),
  label: z.string(),
  start: isoDate,
  end: isoDate,
  /** The system's own remark about this term (dates that differ for some grades), shown as it is, never parsed */
  note: z.string().optional(),
});
export type Term = z.infer<typeof term>;

/** A break in the school year; a range of days with an optional remark from the system */
export const holiday = dateRange.extend({ note: z.string().optional() });
export type Holiday = z.infer<typeof holiday>;

export const calendar = z.object({
  schoolYear: z.object({ externalId: nonEmpty, label: z.string(), start: isoDate, end: isoDate }),
  /** Ordered; empty for systems with continuous assessment. */
  terms: z.array(term),
  holidays: z.array(holiday).optional(),
  /**
   * The grading scale of this student in this school year, when it differs from the manifest default.
   * null: no marks are given this year (early grades, narrative assessment); the UI switches to its no-marks mode.
   * Absent: the manifest's gradingScale applies.
   */
  gradingScaleId: z.string().nullable().optional(),
});
export type Calendar = z.infer<typeof calendar>;

export const subject = z.object({
  externalId: nonEmpty,
  name: nonEmpty,
  teacherName: z.string().optional(),
  level: z.enum(['regular', 'honors', 'ap', 'ib', 'other']).optional(),
  credits: z.number().optional(),
  gradingScheme: z
    .object({
      categories: z.array(z.object({ key: z.string(), label: z.string(), weight: z.number() })),
      dropLowest: z.number().int().optional(),
    })
    .optional(),
});
export type Subject = z.infer<typeof subject>;

export const markKind = z.enum(['numeric', 'pass', 'fail', 'exempt', 'not_assessed', 'other']);
export type MarkKind = z.infer<typeof markKind>;

export const workType = z.enum([
  'classwork',
  'homework',
  'test',
  'quiz',
  'lab',
  'practical',
  'essay',
  'dictation',
  'oral',
  'project',
  'other',
]);
export type WorkType = z.infer<typeof workType>;

export const mark = z.object({
  externalId: nonEmpty,
  date: isoDate,
  subjectExternalId: nonEmpty,
  subjectName: nonEmpty,
  lessonExternalId: z.string().optional(),
  /** Exactly what the system shows: "8", "7/9", "A-", "17/20". */
  raw: z.string(),
  kind: markKind,
  /** Numeric values on the student's scale; [] for non-numeric kinds. Each value counts once in averages. */
  values: z.array(z.number()),
  /** Override of the student's scale for this one mark (a pass/fail subject inside a numeric school). */
  scaleId: z.string().optional(),
  workType: workType.optional(),
  workTypeRaw: z.string().optional(),
  title: z.string().optional(),
  assessmentType: z.enum(['daily', 'homework', 'quiz', 'test', 'exam', 'performance', 'project', 'other']).optional(),
  dimension: z.enum(['attainment', 'effort', 'behaviour']).optional(),
  criterion: z.string().optional(),
  weight: z.number().positive().optional(),
  maxPoints: z.number().positive().optional(),
  modifier: z.enum(['+', '-']).optional(),
  status: z.enum(['graded', 'missing', 'excused', 'late', 'incomplete', 'not_due']).optional(),
  postedAt: isoDate.optional(),
  cohort: z
    .object({
      average: z.number().optional(),
      sd: z.number().optional(),
      rank: z.number().int().optional(),
      size: z.number().int().optional(),
      percentile: z.number().optional(),
      gradeBand: z.string().optional(),
    })
    .optional(),
  comment: z.string().optional(),
  authorExternalId: z.string().optional(),
});
export type Mark = z.infer<typeof mark>;

/** Attendance is never a mark: averages do not see it. */
export const attendance = z.object({
  externalId: nonEmpty,
  date: isoDate,
  lessonExternalId: z.string().optional(),
  subjectExternalId: z.string().optional(),
  status: z.enum(['absent', 'late', 'left_early', 'present_other']),
  excused: z.boolean().optional(),
  minutes: z.number().optional(),
  reason: z.string().optional(),
  code: z.string().optional(),
});
export type Attendance = z.infer<typeof attendance>;

export const lessonType = z.enum(['regular', 'test', 'lab', 'practical', 'excursion', 'other']);
export type LessonType = z.infer<typeof lessonType>;

export const lesson = z.object({
  /** Stable id of this occurrence; built from date + slot + subject when the system has none. */
  externalId: nonEmpty,
  date: isoDate,
  slot: z.number().int().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  subjectExternalId: nonEmpty,
  subjectName: nonEmpty,
  teacherExternalId: z.string().optional(),
  teacherName: z.string().optional(),
  topic: z.string().optional(),
  homework: z.string().optional(),
  homeworkDueDate: isoDate.optional(),
  hasAttachments: z.boolean().optional(),
  lessonType: lessonType.optional(),
  substituteTeacherName: z.string().optional(),
  marks: z.array(mark),
  /** Attendance that comes with the lesson (capabilities.attendance = 'derived', e.g. an "absent" mark cell) */
  attendance: z.array(attendance).optional(),
  cancelled: z.boolean().optional(),
});
export type Lesson = z.infer<typeof lesson>;

export const homeworkItem = z.object({
  externalId: nonEmpty,
  subjectExternalId: nonEmpty,
  subjectName: nonEmpty,
  title: z.string(),
  description: z.string().optional(),
  setDate: isoDate,
  dueDate: isoDate,
  status: z.enum(['set', 'submitted', 'late', 'missing', 'marked']).optional(),
  markExternalId: z.string().optional(),
});
export type HomeworkItem = z.infer<typeof homeworkItem>;

export const behaviourEvent = z.object({
  externalId: nonEmpty,
  date: isoDate,
  points: z.number().optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  category: z.string().optional(),
  comment: z.string().optional(),
  subjectExternalId: z.string().optional(),
  authorExternalId: z.string().optional(),
});
export type BehaviourEvent = z.infer<typeof behaviourEvent>;

export const finalMarkRole = z.enum([
  'final',
  'current',
  'predicted',
  'proposed',
  'adjusted',
  'target',
  'thematic',
  'effort',
  'behaviour',
]);
export type FinalMarkRole = z.infer<typeof finalMarkRole>;

export const finalMark = z.object({
  subjectExternalId: z.string().nullable(),
  subjectName: nonEmpty,
  /** null = the year final. */
  termExternalId: z.string().nullable(),
  raw: z.string(),
  value: z.number().nullable(),
  kind: markKind,
  role: finalMarkRole.optional(),
  label: z.string().optional(),
  date: isoDate.optional(),
});
export type FinalMark = z.infer<typeof finalMark>;
