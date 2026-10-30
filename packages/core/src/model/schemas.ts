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
  /** The school's name when the system gives one; the picker falls back to the diary's name (design.md 4) */
  schoolName: z.string().optional(),
  /** The class or year group in the system, when its URLs or data need it */
  classExternalId: z.string().optional(),
  className: z.string().optional(),
  grade: z.number().int().optional(),
  gradeLabel: z.string().optional(),
  /** The school's IANA zone when it differs from the manifest's (a national system over several zones) */
  timezone: z.string().optional(),
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

/**
 * Which holidays these are, when the system says so; the app names them from it ("Autumn holidays",
 * holiday.name.autumn), never by month
 */
export const holidayKind = z.enum(['autumn', 'winter', 'spring', 'summer', 'additional', 'other']);
export type HolidayKind = z.infer<typeof holidayKind>;

/** A break in the school year; a range of days with an optional remark and kind from the system */
export const holiday = dateRange.extend({ note: z.string().optional(), kind: holidayKind.optional() });
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
  /** The system's abbreviation, for narrow grids */
  shortName: z.string().optional(),
  /** The student's own teacher: of the student's group on a split subject (capabilities.teacherNames) */
  teacherExternalId: z.string().optional(),
  teacherName: z.string().optional(),
  /** The student's subgroup, set or section as the system names it; absent when the class is not split */
  groupLabel: z.string().optional(),
  /** regular is never shown; advanced is the post-Soviet "advanced" (in-depth) level; honors, ap, ib are US course levels */
  level: z.enum(['regular', 'advanced', 'honors', 'ap', 'ib', 'other']).optional(),
  /** The system's own wording of the level, shown when it is not regular */
  levelLabel: z.string().optional(),
  /** From the teaching plan; absent when the system plans per fortnight or not at all */
  lessonsPerWeek: z.number().positive().optional(),
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

export const behaviourEvent = z.object({
  externalId: nonEmpty,
  date: isoDate,
  points: z.number().optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  category: z.string().optional(),
  comment: z.string().optional(),
  subjectExternalId: z.string().optional(),
  authorExternalId: z.string().optional(),
  /** The lesson it was written on, when the system ties it to one (a teacher's comment without a mark) */
  lessonExternalId: z.string().optional(),
});
export type BehaviourEvent = z.infer<typeof behaviourEvent>;

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
  /** As the timetable shows it ("201", "Lab 2"); from the lesson or, on the server, from the week template */
  room: z.string().optional(),
  /** The student's subgroup when the subject is split */
  groupLabel: z.string().optional(),
  /**
   * An opaque key of the timetable entry this lesson comes from (a lesson template id, for example). The server matches
   * a lesson to the student's week template with it (docs/providers.md 4); absent when the system has none.
   */
  templateRef: z.string().optional(),
  marks: z.array(mark),
  /** Attendance that comes with the lesson (capabilities.attendance = 'derived', e.g. an "absent" mark cell) */
  attendance: z.array(attendance).optional(),
  /** Teacher remarks that come with the lesson (capabilities.behaviour = 'derived'), e.g. a comment without a mark */
  behaviour: z.array(behaviourEvent).optional(),
  cancelled: z.boolean().optional(),
});
export type Lesson = z.infer<typeof lesson>;

/** "HH:MM" */
const clock = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM');
const weekdayNumber = z.number().int().min(0).max(6);

/** The bell schedule of the student's class (capabilities.bellSchedule). Breaks are the gaps between periods. */
export const bellSchedule = z.object({
  externalId: nonEmpty,
  /** The system's title, e.g. a shift or "Year 1" */
  label: z.string().optional(),
  /** Weekdays it applies to, 0 = Sunday as in manifest.calendar */
  days: z.array(weekdayNumber).min(1),
  /** Slot numbers as lessons use them (they may start at 0) */
  periods: z.array(z.object({ slot: z.number().int().min(0), start: clock, end: clock })).min(1),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
});
export type BellSchedule = z.infer<typeof bellSchedule>;

/**
 * The student's own regular week for a term (capabilities.weekTemplate): what the timetable plans, not what happened.
 * Only the student's lessons: never another subgroup's (docs/providers.md 4, "Teachers are third parties").
 */
export const weekTemplate = z.object({
  /** Absent = the whole year */
  termExternalId: z.string().optional(),
  /** 1, or 2 for Week A / Week B timetables */
  cycleWeeks: z.number().int().min(1),
  entries: z.array(
    z.object({
      cycleWeek: z.number().int().min(1),
      weekday: weekdayNumber,
      slot: z.number().int().min(0),
      start: clock.optional(),
      end: clock.optional(),
      subjectExternalId: nonEmpty,
      subjectName: nonEmpty,
      groupLabel: z.string().optional(),
      room: z.string().optional(),
      teacherExternalId: z.string().optional(),
      teacherName: z.string().optional(),
      /** The same opaque key lessons carry in Lesson.templateRef */
      templateRef: z.string().optional(),
    }),
  ),
});
export type WeekTemplate = z.infer<typeof weekTemplate>;
export type WeekTemplateEntry = WeekTemplate['entries'][number];

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
