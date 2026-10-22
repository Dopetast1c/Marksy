import { z } from 'zod';

// The fictional demo diary API. Loose objects: unknown fields pass through and are reported as drift, never fatal.

export const authResponse = z.looseObject({ access_token: z.string() });

export const profileResponse = z.looseObject({
  user_id: z.string(),
  display_name: z.string(),
  pupils: z.array(
    z.looseObject({
      pupil_id: z.string(),
      name: z.looseObject({ first: z.string(), last: z.string() }),
      school: z.string(),
      class: z.looseObject({ id: z.string(), title: z.string(), year: z.number().int() }),
    }),
  ),
});
export type ProfileResponse = z.infer<typeof profileResponse>;
export type PupilRaw = ProfileResponse['pupils'][number];

const span = { from: z.string(), till: z.string() };

export const yearResponse = z.looseObject({
  year: z.looseObject({ code: z.string(), title: z.string(), ...span }),
  periods: z.array(z.looseObject({ code: z.string(), kind: z.string(), n: z.number().int(), ...span })),
  breaks: z.array(z.looseObject(span)),
  /** false: no marks this year (the youngest classes) */
  graded: z.boolean(),
});
export type YearResponse = z.infer<typeof yearResponse>;

const subjectRaw = z.looseObject({ code: z.string(), title: z.string() });
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
  subject: subjectRaw,
  topic: z.string().nullable(),
  homework: z.string().nullable(),
  kind: z.string().nullable(),
  marks: z.array(markRaw),
});
export type LessonRaw = z.infer<typeof lessonRaw>;

export const dayRaw = z.looseObject({ date: z.string(), lessons: z.array(lessonRaw) });
export const diaryResponse = z.looseObject({ week: z.string(), days: z.array(dayRaw) });

export const finalRow = z.looseObject({ subject: subjectRaw, period: z.string().nullable(), value: z.string() });
export type FinalRow = z.infer<typeof finalRow>;
export const finalsResponse = z.looseObject({ rows: z.array(finalRow) });
