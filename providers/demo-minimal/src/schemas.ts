import { z } from 'zod';

// The fictional demo API. Loose objects: unknown fields pass through and never fail parsing (CLAUDE.md "Hard rules").

export const sessionResponse = z.looseObject({ token: z.string() });

export const meResponse = z.looseObject({
  id: z.string(),
  name: z.string(),
  children: z.array(
    z.looseObject({ id: z.string(), first_name: z.string(), last_name: z.string(), group: z.string().optional() }),
  ),
});
export type MeResponse = z.infer<typeof meResponse>;

export const yearResponse = z.looseObject({
  id: z.string(),
  label: z.string(),
  start: z.string(),
  end: z.string(),
  /** false: no marks are given to this child this year */
  marks: z.boolean().optional(),
});
export type YearResponse = z.infer<typeof yearResponse>;

export const coursesResponse = z.array(z.looseObject({ id: z.string(), title: z.string() }));

export const gradesResponse = z.array(
  z.looseObject({
    id: z.string(),
    course_id: z.string(),
    course_title: z.string(),
    date: z.string(),
    score: z.number().nullable(),
    status: z.string(),
  }),
);
export type GradeRaw = z.infer<typeof gradesResponse>[number];
