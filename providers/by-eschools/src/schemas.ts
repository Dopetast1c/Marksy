import { z } from 'zod';

// Raw e-schools.by responses (docs/api-spec.md 6, 7). Loose objects: unknown fields pass and are reported as drift by
// the core drift checker. Enum-like fields are plain strings; the known values are listed below and checked by the
// mapper, so a new value is drift, not a crash. Only what the mapper reads is required.

const id = z.string().min(1);
const ms = z.number();
const text = z.string().nullable().optional();
/** A field seen in real responses (first probe, 2026-10) that the mapper does not read. Known, so not drift. */
const seen = z.unknown().optional();
/**
 * Personal data seen in real responses: never stored, never logged, never mapped. sanitize() replaces or drops each
 * of these (tested in provider.test.ts); the list is the contract for that test.
 */
const personal = z.unknown().optional();
export const PERSONAL_FIELDS = [
  'first_name',
  'second_name',
  'last_name',
  'school_name',
  'parent_code',
  'profile_id',
  'position',
  'author',
  'school',
] as const;

export const loginResponse = z.looseObject({ auth_token: z.string().min(1), refresh_token: z.string().optional() });

export const meResponse = z.looseObject({
  user_id: id,
  person_kind: z.string().nullable().optional(),
  full_name: text,
  roles: seen,
  school_id: seen,
  our_school_id: seen,
  profile_id: personal,
  school_name: personal,
  position: personal,
  first_name: personal,
  second_name: personal,
  last_name: personal,
  parent_code: personal,
  students_for_parent: z.array(z.looseObject({ profile_id: id, full_name: z.string(), school_id: id })),
});
export type MeResponse = z.infer<typeof meResponse>;

export const schoolYearResponse = z.looseObject({
  uuid: id,
  summary: seen,
  label: text,
  start_year: z.number().optional(),
  end_year: z.number().optional(),
  start_ts: ms,
  end_ts: ms,
  status: seen,
  author: personal,
});
export type SchoolYearResponse = z.infer<typeof schoolYearResponse>;

export const timeActivity = z.looseObject({
  uuid: id,
  summary: seen,
  school_year: seen,
  title: z.string(),
  description: text,
  type: z.string(),
  start_date: ms,
  end_date: ms,
});
export type TimeActivity = z.infer<typeof timeActivity>;
export const TIME_ACTIVITY_TYPES = ['QUARTER', 'HOLIDAYS'] as const;
export const QUARTER_TITLES = ['FIRST_QUARTER', 'SECOND_QUARTER', 'THIRD_QUARTER', 'FOURTH_QUARTER'] as const;

export const weekActivity = z.looseObject({
  uuid: id,
  summary: text,
  time_activity_id: z.string().nullable().optional(),
  start_ts: ms,
  end_ts: ms,
});
export type WeekActivity = z.infer<typeof weekActivity>;

export const schoolClass = z.looseObject({
  uuid: id,
  summary: seen,
  label: text,
  level: z.number().nullable().optional(),
  school: personal,
  class_number: text,
  dt_disbanded: z.unknown().optional(),
  graduating_year: seen,
  graduating: seen,
});
export type SchoolClass = z.infer<typeof schoolClass>;

export const educationalSubject = z.looseObject({ uuid: id, name: z.string().min(1) });

export const lessonMark = z.looseObject({
  uuid: id,
  summary: seen,
  type: z.string().nullable().optional(),
  mark: z.string().nullable().optional(),
  kind: z.string(),
  comment: text,
  /** the teacher's id; mapped to authorExternalId as an opaque id, never a name */
  author: z.string().nullable().optional(),
});
export type LessonMark = z.infer<typeof lessonMark>;
export const MARK_KINDS = [
  'SINGLE',
  'DOUBLE',
  'ABSENT',
  'PASS',
  'NOT_PASS',
  'EXEMPT',
  'MASTERED',
  'NOT_MASTERED',
  'NOT_TAKEN',
] as const;
export const WORK_TYPES = [
  'CLASSWORK',
  'HOMEWORK',
  'PRACTICAL_WORK',
  'LABORATORY_WORK',
  'CREATIVE_WORK',
  'SUMMARY',
  'DICTATION',
  'TEST',
  'INDEPENDENT_WORK',
  'ESSAY',
  'KNOWLEDGE_CONTROL',
  'BY_HEART',
  'TRANSLATION',
] as const;
export const LESSON_TYPES = ['INDEPENDENT_WORK', 'PRACTICAL_WORK', 'LABORATORY_WORK', 'TEST', 'EXCURSION'] as const;

export const slot = z.looseObject({
  /** null in real responses for some lessons (first probe, 2026-10); the id then falls back, see map.ts lessonIdOf */
  lesson_uuid: z.string().min(1).nullable(),
  lesson_template_id: seen,
  homework_source_id: seen,
  subject_id: id,
  subject_title: z.string().min(1),
  teacher_id: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  number: z.number().nullable().optional(),
  topic: text,
  homework: text,
  message: text,
  start_time: text,
  has_attachments_or_links: z.boolean().nullable().optional(),
  lesson_mark: lessonMark.nullable().optional(),
  substitution: z.unknown().optional(),
});
export type Slot = z.infer<typeof slot>;

export const lessonsDay = z.looseObject({
  day_of_week: z.number().optional(),
  date: ms,
  slots: z.array(z.unknown()),
});
export type LessonsDay = z.infer<typeof lessonsDay>;

/**
 * final/whole. Verified only empty ({ marks: {}, behaviour: {}, diary_signature: {} }); the frontend reads
 * marks[<key1>][<key2>] = { mark, kind }, most likely subject id, then period. Provisional until Q1 finals are seen.
 */
export const finalMarkCell = z.looseObject({
  mark: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
});
export const finalWholeResponse = z.looseObject({
  marks: z.record(z.string(), z.record(z.string(), z.unknown())),
  behaviour: z.unknown().optional(),
  diary_signature: z.unknown().optional(),
});
export type FinalWholeResponse = z.infer<typeof finalWholeResponse>;
