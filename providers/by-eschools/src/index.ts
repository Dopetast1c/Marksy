import {
  driftChecker,
  ProviderAuthError,
  ProviderBlockedError,
  ProviderSchemaError,
  ProviderUnavailableError,
  providerManifest,
} from '@marksy/core';
import type { DiaryProvider, HttpResponse, ProviderContext, Session, StudentRef, Subject } from '@marksy/core';
import manifestJson from '../provider.json';
import { dayRange, overlaps } from './dates';
import { currentClass, mapAccount, mapCalendar, mapFinals, mapLessonsWeek, mapSubjects } from './map';
import { sanitize } from './sanitize';
import {
  finalWholeResponse,
  lessonsDay,
  loginResponse,
  meResponse,
  schoolClass,
  schoolYearResponse,
  timeActivity,
  weekActivity,
} from './schemas';
import type { SchoolClass, SchoolYearResponse, TimeActivity, WeekActivity } from './schemas';

// by-eschools: Belarus, diary.e-schools.by (docs/api-spec.md). Read-only, one login per run, every request through
// ctx.http. The week list, the calendar, classes and subjects are fetched once per session and reused, so a week of
// lessons costs one request.

export const manifest = providerManifest.parse(manifestJson);

const API = '/api/v1';
const DIARY = `${API}/education/diary`;
const seg = encodeURIComponent;

interface SessionCache {
  year?: SchoolYearResponse;
  activities?: TimeActivity[];
  weeks?: WeekActivity[];
  classes: Map<string, SchoolClass | undefined>;
  subjects: Map<string, Subject[]>;
}
const caches = new WeakMap<Session, SessionCache>();
function cacheOf(session: Session): SessionCache {
  let c = caches.get(session);
  if (!c) caches.set(session, (c = { classes: new Map(), subjects: new Map() }));
  return c;
}

/** Is this an error body in one of the shapes the frontend handles (docs/api-spec.md 4.5)? */
export function knownErrorShape(text: string): boolean {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return true; // plain string
  }
  if (typeof body === 'string') return true;
  if (Array.isArray(body))
    return body.every((e) => e && typeof e === 'object' && ('message' in e || 'error_code' in e));
  if (body && typeof body === 'object')
    return ['details', 'errors', 'content', 'message', 'value'].some((k) => k in body);
  return false;
}

/**
 * HTTP status -> typed failure (docs/providers.md 3). A rejected login is final for the account; a 401 on a data call
 * means the two-hour token ran out, which the next run's fresh login fixes, so it is "unavailable", not "auth".
 * Error texts are never copied into the error: they may contain the login.
 */
export function failure(res: HttpResponse, endpoint: string, ctx: ProviderContext, login = false): Error {
  if (!knownErrorShape(res.text)) driftChecker(ctx.drift, endpoint).errorShape('error');
  if (/IC authorization/i.test(res.headers['www-authenticate'] ?? '')) {
    return new ProviderBlockedError(`${endpoint}: staff authorization requested`);
  }
  if (login && [400, 401, 403].includes(res.status)) return new ProviderAuthError('Login rejected');
  if (res.status === 403) return new ProviderBlockedError(`${endpoint}: forbidden`);
  return new ProviderUnavailableError(`${endpoint}: HTTP ${res.status}`, res.status);
}

function body(res: HttpResponse, endpoint: string, ctx: ProviderContext): unknown {
  if (res.status !== 200) throw failure(res, endpoint, ctx);
  try {
    return res.json();
  } catch {
    driftChecker(ctx.drift, endpoint).errorShape('body');
    throw new ProviderSchemaError(`${endpoint}: not JSON`);
  }
}

async function get(
  session: Session,
  ctx: ProviderContext,
  endpoint: string,
  path: string,
  query?: Record<string, string>,
) {
  const res = await ctx.http.get(path, {
    // e-schools wants the raw token, "Bearer <token>" is a 401 (api-spec 4.2)
    headers: { authorization: String(session.token) },
    ...(query && { query }),
  });
  return body(res, endpoint, ctx);
}

async function classOf(session: Session, student: StudentRef, ctx: ProviderContext): Promise<SchoolClass | undefined> {
  const cache = cacheOf(session);
  if (cache.classes.has(student.externalId)) return cache.classes.get(student.externalId);
  const raw = await get(
    session,
    ctx,
    'classes',
    `${DIARY}/schools/${seg(student.schoolId ?? '')}/students/${seg(student.externalId)}/classes`,
  );
  const cls = currentClass(driftChecker(ctx.drift, 'classes').items(schoolClass, raw, 'classes'));
  cache.classes.set(student.externalId, cls);
  return cls;
}

/** The class path of a student; the class id comes from the account (StudentRef.classExternalId) or one request. */
async function classPath(session: Session, student: StudentRef, ctx: ProviderContext): Promise<string> {
  const classId = student.classExternalId ?? (await classOf(session, student, ctx))?.uuid;
  if (!classId || !student.schoolId) throw new ProviderSchemaError('classes: the student has no class');
  return `${DIARY}/schools/${seg(student.schoolId)}/classes/${seg(classId)}/students/${seg(student.externalId)}`;
}

async function calendarSources(session: Session, ctx: ProviderContext) {
  const cache = cacheOf(session);
  cache.year ??= driftChecker(ctx.drift, 'school_year').parse(
    schoolYearResponse,
    await get(session, ctx, 'school_year', `${DIARY}/school_year`),
  );
  cache.activities ??= driftChecker(ctx.drift, 'time_activities').items(
    timeActivity,
    await get(session, ctx, 'time_activities', `${DIARY}/time_activities`),
    'time_activities',
  );
  return { year: cache.year, activities: cache.activities };
}

async function weeksOf(session: Session, ctx: ProviderContext): Promise<WeekActivity[]> {
  const cache = cacheOf(session);
  cache.weeks ??= driftChecker(ctx.drift, 'week_activities').items(
    weekActivity,
    await get(session, ctx, 'week_activities', `${DIARY}/time_activities/week_activities`),
    'week_activities',
  );
  return cache.weeks;
}

/** The school week containing `today`, or during holidays the last one that has started; null before the year. */
export async function currentWeekRange(session: Session, ctx: ProviderContext, today: string) {
  const ranges = (await weeksOf(session, ctx))
    .map((w) => dayRange({ start: w.start_ts, end: w.end_ts }, manifest.timezone))
    .filter((r) => r.from <= today)
    .sort((a, b) => a.from.localeCompare(b.from));
  return ranges.at(-1) ?? null;
}

export const byEschools: DiaryProvider = {
  manifest,

  async login(credentials, ctx) {
    const res = await ctx.http.post(
      `${API}/auth/login/parent`,
      { login: credentials.login, password: credentials.password },
      { login: true },
    );
    if (res.status !== 200) throw failure(res, 'login', ctx, true);
    const tokens = driftChecker(ctx.drift, 'login').parse(loginResponse, body(res, 'login', ctx));
    return { token: tokens.auth_token };
  },

  async getAccount(session, ctx) {
    const me = driftChecker(ctx.drift, 'me').parse(meResponse, await get(session, ctx, 'me', `${API}/admin/auth/me`));
    const classes = new Map<string, SchoolClass | undefined>();
    for (const s of me.students_for_parent) {
      classes.set(
        s.profile_id,
        await classOf(session, { externalId: s.profile_id, fullName: s.full_name, schoolId: s.school_id }, ctx),
      );
    }
    return mapAccount(me, classes);
  },

  async getCalendar(session, student, ctx) {
    const { year, activities } = await calendarSources(session, ctx);
    return mapCalendar(year, activities, student, manifest.timezone, driftChecker(ctx.drift, 'time_activities'));
  },

  async getSubjects(session, student, ctx) {
    const cache = cacheOf(session);
    const cached = cache.subjects.get(student.externalId);
    if (cached) return cached;
    const path = `${await classPath(session, student, ctx)}/educational_subjects`;
    const subjects = mapSubjects(
      await get(session, ctx, 'educational_subjects', path),
      driftChecker(ctx.drift, 'educational_subjects'),
    );
    cache.subjects.set(student.externalId, subjects);
    return subjects;
  },

  async getLessons(session, student, range, ctx) {
    const weeks = (await weeksOf(session, ctx)).filter((w) =>
      overlaps(dayRange({ start: w.start_ts, end: w.end_ts }, manifest.timezone), range),
    );
    const base = await classPath(session, student, ctx);
    const check = driftChecker(ctx.drift, 'lessons');
    const out = [];
    for (const w of weeks) {
      const raw = await get(session, ctx, 'lessons', `${base}/lessons`, { week_activity_uuid: w.uuid });
      out.push(...mapLessonsWeek(check.items(lessonsDay, raw, 'days'), manifest.timezone, check));
    }
    return out.filter((l) => l.date >= range.from && l.date <= range.to);
  },

  async getFinalMarks(session, student, ctx) {
    const check = driftChecker(ctx.drift, 'final');
    const raw = check.parse(
      finalWholeResponse,
      await get(session, ctx, 'final', `${await classPath(session, student, ctx)}/final/whole`),
    );
    const subjects = await byEschools.getSubjects(session, student, ctx);
    const { terms } = await byEschools.getCalendar(session, student, ctx);
    return mapFinals(raw, subjects, terms, check);
  },

  sanitize,
};
