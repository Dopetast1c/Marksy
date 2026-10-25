import { z } from 'zod';

// The fictional demo diary API (providers/demo-full, providers/demo-lite). Loose objects: unknown fields pass through
// and are reported as drift, never fatal. The API is per pupil: everything it returns is that pupil's own, so a pupil
// in a subgroup sees only that subgroup's teacher, room and lessons.

export const authResponse = z.looseObject({ access_token: z.string() });

export const profileResponse = z.looseObject({
  user_id: z.string(),
  display_name: z.string(),
  pupils: z.array(
    z.looseObject({
      pupil_id: z.string(),
      name: z.looseObject({ first: z.string(), last: z.string() }),
      school: z.string(),
      /** The school's name, when the diary gives one */
      school_title: z.string().optional(),
      class: z.looseObject({ id: z.string(), title: z.string(), year: z.number().int() }),
    }),
  ),
});
export type ProfileResponse = z.infer<typeof profileResponse>;
export type PupilRaw = ProfileResponse['pupils'][number];

const span = { from: z.string(), till: z.string() };

export const yearResponse = z.looseObject({
  year: z.looseObject({ code: z.string(), title: z.string(), ...span }),
  periods: z.array(
    z.looseObject({ code: z.string(), kind: z.string(), n: z.number().int(), ...span, remark: z.string().optional() }),
  ),
  breaks: z.array(z.looseObject({ ...span, remark: z.string().optional(), kind: z.string().optional() })),
  /** false: no marks this year (the youngest classes) */
  graded: z.boolean(),
});
export type YearResponse = z.infer<typeof yearResponse>;

const teacherRaw = z.looseObject({ id: z.string(), name: z.string() });

/** A subject of the pupil: the pupil's own teacher and subgroup on a split subject */
export const subjectRaw = z.looseObject({
  code: z.string(),
  title: z.string(),
  short: z.string().optional(),
  teacher: teacherRaw.nullable().optional(),
  group: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  level_text: z.string().nullable().optional(),
  per_week: z.number().nullable().optional(),
});
export type SubjectRaw = z.infer<typeof subjectRaw>;
export const subjectsResponse = z.array(subjectRaw);

export const markRaw = z.looseObject({
  uid: z.string(),
  value: z.string(),
  type: z.string().nullable(),
  note: z.string().nullable(),
});
export type MarkRaw = z.infer<typeof markRaw>;

export const lessonRaw = z.looseObject({
  /** null until the school fills in the timetable entry; the id then appears on a later fetch */
  uid: z.string().nullable(),
  n: z.number().int(),
  starts: z.string().nullable(),
  subject: z.looseObject({ code: z.string(), title: z.string() }),
  topic: z.string().nullable(),
  homework: z.string().nullable(),
  kind: z.string().nullable(),
  marks: z.array(markRaw),
  /** The timetable entry the lesson comes from */
  tpl: z.string().nullable().optional(),
});
export type LessonRaw = z.infer<typeof lessonRaw>;

export const dayRaw = z.looseObject({ date: z.string(), lessons: z.array(lessonRaw) });
export const diaryResponse = z.looseObject({ week: z.string(), days: z.array(dayRaw) });

export const finalRow = z.looseObject({
  subject: z.looseObject({ code: z.string(), title: z.string() }),
  period: z.string().nullable(),
  value: z.string(),
});
export type FinalRow = z.infer<typeof finalRow>;
export const finalsResponse = z.looseObject({ rows: z.array(finalRow) });

/** The pupil's class bells: one schedule per group of weekdays */
export const bellsRaw = z.looseObject({
  code: z.string(),
  title: z.string().nullable(),
  days: z.array(z.number().int()),
  periods: z.array(z.looseObject({ n: z.number().int(), from: z.string(), till: z.string() })),
});
export type BellsRaw = z.infer<typeof bellsRaw>;
export const bellsResponse = z.array(bellsRaw);

/** The pupil's regular week for a term */
export const timetableRaw = z.looseObject({
  term: z.string().nullable(),
  week: z.array(
    z.looseObject({
      day: z.number().int(),
      n: z.number().int(),
      tpl: z.string().nullable(),
      subject: z.looseObject({ code: z.string(), title: z.string() }),
      group: z.string().nullable(),
      room: z.string().nullable(),
      teacher: teacherRaw.nullable(),
    }),
  ),
});
export type TimetableRaw = z.infer<typeof timetableRaw>;
