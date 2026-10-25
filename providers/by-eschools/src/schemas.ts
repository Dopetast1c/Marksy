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
/** The holidays' titles seen in real responses (2026-10-25), mapped to Holiday.kind; any other is "other" and drift */
export const HOLIDAY_KINDS = {
  AUTUMN_HOLIDAYS: 'autumn',
  WINTER_HOLIDAYS: 'winter',
  SPRING_HOLIDAYS: 'spring',
  SUMMER_HOLIDAYS: 'summer',
  ADDITIONAL_HOLIDAYS: 'additional',
} as const;
export const QUARTER_TITLES = ['FIRST_QUARTER', 'SECOND_QUARTER', 'THIRD_QUARTER', 'FOURTH_QUARTER'] as const;
/** A half year as a timetable's period (6.10.2): FIRST_HALF_YEAR seen in real responses, SECOND_HALF_YEAR assumed */
export const HALF_YEAR_TITLES = ['FIRST_HALF_YEAR', 'SECOND_HALF_YEAR'] as const;
export const TIMETABLE_PERIODS = [...QUARTER_TITLES, ...HALF_YEAR_TITLES] as const;

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
  /** null with no mark: a teacher's comment without a mark (second sync:once, 2026-10-23) */
  kind: z.string().nullable().optional(),
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
  /** The timetable entry of the lesson (6.10.3 template): its subgroup, teacher, room and bell time */
  lesson_template_id: z.string().nullable().optional(),
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

// --- School details (docs/api-spec.md 6.7a, 6.10), read once a day ---------------------------------------------

/** 6.7a: the class's subjects, one row per subject and teaching group, with the teacher (personal data) */
export const studentSubjectRow = z.looseObject({
  id,
  partition_type: z.string().nullable().optional(),
  type: seen,
  subject_title: z.string().nullable().optional(),
  level_of_study: z.string().nullable().optional(),
  teacher_id: z.string().nullable().optional(),
  /** a third person's full name, family name first: only the student's own teacher is ever kept */
  teacher: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  group_name: z.string().nullable().optional(),
});
export type StudentSubjectRow = z.infer<typeof studentSubjectRow>;
export const PARTITION_TYPES = ['CLASS', 'GROUP'] as const;

const bellTime = z.looseObject({
  uuid: seen,
  summary: seen,
  number: z.number().int(),
  start_time: z.string(),
  end_time: z.string(),
});
export type BellTime = z.infer<typeof bellTime>;

/** 6.10.1: the school's bell schedules, one per shift and group of grades */
export const bellScheduleRaw = z.looseObject({
  uuid: id,
  summary: seen,
  title: z.string().nullable().optional(),
  shift: z.number().nullable().optional(),
  levels: z.array(z.number()).nullable().optional(),
  period: z.string().nullable().optional(),
  days_of_week: z.array(
    z.looseObject({ uuid: seen, summary: seen, days: z.array(z.number().int()), time_of_bells: z.array(bellTime) }),
  ),
});
export type BellScheduleRaw = z.infer<typeof bellScheduleRaw>;

/** 6.10.2: a class timetable for a quarter or a half year, both subgroups included */
export const classTimetable = z.looseObject({
  uuid: seen,
  summary: seen,
  schedule_of_bells_uuid: z.string().nullable().optional(),
  class_id: seen,
  class_level: seen,
  period: z.string().nullable().optional(),
  days_of_week: z.array(
    z.looseObject({
      day_of_week: z.number().int(),
      timetable_slots: z.array(
        z.looseObject({
          time_of_bells: bellTime.nullable().optional(),
          slots: z.array(
            z.looseObject({
              uuid: seen,
              summary: seen,
              number: z.number().int().nullable().optional(),
              room_id: z.string().nullable().optional(),
              lesson_template_id: z.string().nullable().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type ClassTimetable = z.infer<typeof classTimetable>;

/** 6.10.3: the class's teaching plan; a template per teaching group, with its teacher (personal data) */
export const planningSubject = z.looseObject({
  uuid: id,
  summary: seen,
  author: personal,
  dt_create: seen,
  dt_update: seen,
  partition_type: z.string().nullable().optional(),
  type: seen,
  pass_exam: seen,
  additional_characteristic: seen,
  special_students: seen,
  school_subject: z
    .looseObject({
      uuid: seen,
      summary: seen,
      kind: seen,
      status: seen,
      ic_code: seen,
      version: seen,
      as_json: z
        .looseObject({
          short_name: text,
          uuid: seen,
          summary: seen,
          author: personal,
          school: personal,
          subject: seen,
          dt_create: seen,
          dt_update: seen,
          dt_delete: seen,
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  // null: no template this period, so no lessons of the subject; not an error
  templates: z
    .array(
      z.looseObject({
        uuid: id,
        study_hours: z.number().nullable().optional(),
        study_group: z.looseObject({ uuid: seen, name: text, summary: seen }).nullable().optional(),
        teacher: z
          .looseObject({
            id: z.string().nullable().optional(),
            name: personal,
            surname: personal,
            patronymic: personal,
          })
          .nullable()
          .optional(),
        level_of_study: z.looseObject({ uuid: seen, value: text }).nullable().optional(),
        description: seen,
      }),
    )
    .nullable()
    .optional(),
});
export type PlanningSubject = z.infer<typeof planningSubject>;

/** 6.10.4: the school's rooms; only the numbers of the student's own rooms leave the provider */
export const premise = z.looseObject({
  uuid: id,
  audience_number: z.string().nullable().optional(),
  audience_name: seen,
  hull: seen,
  premise_type: seen,
  summary: seen,
  author: personal,
  school: seen,
  dt_create: seen,
  dt_update: seen,
  dt_delete: seen,
});
export type Premise = z.infer<typeof premise>;
