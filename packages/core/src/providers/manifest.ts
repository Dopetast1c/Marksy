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
  /** Teachers of the student's own lessons and subjects, never of other groups */
  teacherNames: z.boolean(),
  /** A room on lessons and in the week template */
  rooms: z.boolean(),
  /** The student's subgroup, set or section on split subjects */
  teachingGroups: z.boolean(),
  /** Start and end of every period (getBellSchedule) */
  bellSchedule: z.boolean(),
  /** The student's regular week for a term (getWeekTemplate) */
  weekTemplate: z.boolean(),
  pastYears: z.boolean(),
  homeworkAssignments: z.boolean(),
  /** Teacher remarks and behaviour points: their own endpoint (getBehaviour), with the lesson (Lesson.behaviour), or none */
  behaviour: z.enum(['separate', 'derived', 'none']),
  cohortStats: z.boolean(),
  criteria: z.boolean(),
  targets: z.boolean(),
  exams: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilities>;

/** "08:00-14:00" */
const timeWindow = z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
/** "fri 20:00-23:00" */
/**
 * "GET /education/diary/**": method, space, path pattern where * is one segment and ** any rest. Read methods only;
 * PUT, PATCH and DELETE can never be listed, and POST only as the login request (refined below).
 */
// the first segment is literal: "GET /**" or "GET /*/x" would open every endpoint of the host
const allowEntry = z.string().regex(/^(GET|HEAD|POST) \/[^*/\s]\S*$/);

/** The API origin: https, no credentials in the URL, no path (the client resolves paths against the origin). */
const apiOrigin = z.url().refine((u) => {
  const url = new URL(u);
  // a host name with a dot: no IP literals, no localhost, nothing that points into the home network by address
  const host = url.hostname;
  const namedHost =
    host.includes('.') && !/^[\d.]+$/.test(host) && !host.startsWith('[') && !host.endsWith('.localhost');
  return (
    url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && namedHost
  );
}, 'baseUrl must be a plain https origin with a host name');

export const providerManifest = z
  .object({
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
    tenant: z
      .object({ kind: z.enum(['url', 'code', 'list']), label: localized, hint: localized.optional() })
      .nullable(),
    auth: z.object({
      kind: z.enum(['password', 'token', 'oauth']),
      fields: z.array(
        z.object({ key: z.string().min(1), label: localized, type: z.enum(['text', 'password', 'token']) }),
      ),
      /**
       * The allow-list entry of the login call, e.g. "POST /auth/login/*". Every request matching it is a login for the
       * HTTP client whatever the provider says: never retried, at most one per run. null for token auth without a call.
       */
      loginRequest: allowEntry.nullable(),
    }),
    /** A built-in scale id (packages/core/src/grading/scales) or a full inline scale. */
    gradingScale: z.union([z.string().min(1), gradingScale]),
    capabilities,
    network: z.object({
      /** Origin of the system's API. The HTTP client accepts paths only and refuses every other host. */
      baseUrl: apiOrigin,
      /** The collector must run from this country (ISO 3166-1 alpha-2); null if any. */
      regionHint: z.string().length(2).nullable(),
      /** The User-Agent the client sends; set here so it can change without code. Absent: the runtime default. */
      userAgent: z.string().min(1).max(300).optional(),
      notes: z.string().optional(),
    }),
    limits: z.object({
      minLoginIntervalMinutes: z.number().int().positive(),
      requestDelayMs: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
      maxRequestsPerRun: z.number().int().positive(),
      syncWindow: timeWindow,
      fetchUnit: z.enum(['week', 'day', 'term']),
      authFailureIsFinal: z.boolean(),
    }),
    homeworkSemantics: z.enum(['assigned-at-lesson', 'due-at-lesson']),
    readOnlyAllowList: z.array(allowEntry).min(1),
  })
  .superRefine((m, ctx) => {
    const login = m.auth.loginRequest;
    if (login !== null && !m.readOnlyAllowList.includes(login)) {
      ctx.addIssue({
        code: 'custom',
        path: ['auth', 'loginRequest'],
        message: 'loginRequest must be in readOnlyAllowList',
      });
    }
    for (const entry of m.readOnlyAllowList) {
      if (entry.startsWith('POST ') && entry !== login) {
        ctx.addIssue({
          code: 'custom',
          path: ['readOnlyAllowList'],
          message: `${entry}: POST is allowed only for the login`,
        });
      }
    }
  });
export type ProviderManifest = z.infer<typeof providerManifest>;
