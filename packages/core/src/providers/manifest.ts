import { z } from 'zod';
import { gradingScale } from '../grading/types';

// provider.json (docs/providers.md section 3). The server enforces limits, the allow-list and the network hints from
// here; a provider cannot loosen them from code.

/** ISO weekday numbers, 0 = Sunday, as Date#getUTCDay returns them. */
const weekday = z.number().int().min(0).max(6);
/** A label per interface language; providers have no other user-facing text. */
const localized = z.record(z.string(), z.string());

export const capabilities = z.object({
  lessons: z.boolean(),
  futureTimetable: z.boolean(),
  topics: z.boolean(),
  homework: z.boolean(),
  attachments: z.boolean(),
  lessonTypes: z.boolean(),
  marksPerLesson: z.enum(['one', 'many', 'none']),
  unattachedMarks: z.boolean(),
  workTypes: z.boolean(),
  comments: z.boolean(),
  weights: z.boolean(),
  attendance: z.enum(['separate', 'derived', 'none']),
  terms: z.enum(['quarter', 'trimester', 'semester', 'other', 'none']),
  finalMarks: z.boolean(),
  teacherNames: z.boolean(),
  pastYears: z.boolean(),
  homeworkAssignments: z.boolean(),
  behaviour: z.boolean(),
  cohortStats: z.boolean(),
  criteria: z.boolean(),
  targets: z.boolean(),
  exams: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilities>;

/** "08:00-14:00" */
const timeWindow = z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
/** "fri 20:00-23:00" */
const weeklyWindow = z.string().regex(/^(mon|tue|wed|thu|fri|sat|sun) \d{2}:\d{2}-\d{2}:\d{2}$/);
/** "GET /education/diary/**": method, space, path pattern where * is one segment and ** any rest. */
const allowEntry = z.string().regex(/^(GET|POST|PUT|PATCH|DELETE|HEAD) \/\S*$/);

export const providerManifest = z.object({
  id: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$|^demo-[a-z0-9-]+$|^_template$/),
  name: z.string().min(1),
  country: z.string().length(2).nullable(),
  region: z.string().nullable(),
  scope: z.enum(['national', 'regional', 'school']),
  website: z.url(),
  status: z.enum(['experimental', 'beta', 'stable', 'broken']),
  maintainers: z.array(z.string()),
  languages: z.object({ default: z.string(), preferred: z.array(z.string()) }),
  calendar: z.object({
    weekStart: weekday,
    weekend: z.array(weekday),
    schoolDays: z.array(weekday).min(1),
  }),
  nameOrder: z.enum(['given-first', 'family-first']),
  timezone: z.string().min(1),
  roles: z.array(z.enum(['parent', 'student'])).min(1),
  tenant: z.object({ kind: z.enum(['url', 'code', 'list']), label: localized, hint: localized.optional() }).nullable(),
  auth: z.object({
    kind: z.enum(['password', 'token', 'oauth']),
    fields: z.array(
      z.object({ key: z.string().min(1), label: localized, type: z.enum(['text', 'password', 'token']) }),
    ),
  }),
  /** A built-in scale id (packages/core/src/grading/scales) or a full inline scale. */
  gradingScale: z.union([z.string().min(1), gradingScale]),
  capabilities,
  network: z.object({
    /** Origin of the system's API. The HTTP client accepts paths only and refuses every other host. */
    baseUrl: z.url(),
    /** The collector must run from this country (ISO 3166-1 alpha-2); null if any. */
    regionHint: z.string().length(2).nullable(),
    notes: z.string().optional(),
  }),
  limits: z.object({
    minLoginIntervalMinutes: z.number().int().positive(),
    requestDelayMs: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    maxRequestsPerRun: z.number().int().positive(),
    syncWindow: timeWindow,
    weeklyRescan: weeklyWindow,
    fetchUnit: z.enum(['week', 'day', 'term']),
    authFailureIsFinal: z.boolean(),
  }),
  homeworkSemantics: z.enum(['assigned-at-lesson', 'due-at-lesson']),
  readOnlyAllowList: z.array(allowEntry).min(1),
});
export type ProviderManifest = z.infer<typeof providerManifest>;
