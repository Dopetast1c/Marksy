import {
  driftChecker,
  ProviderAuthError,
  ProviderBlockedError,
  ProviderSchemaError,
  ProviderUnavailableError,
  providerManifest,
} from '@marksy/core';
import type { DiaryProvider, HttpResponse, Lesson, ProviderContext, Session, StudentRef, Subject } from '@marksy/core';
import manifestJson from '../provider.json';
import { dayRange, overlaps, toISODate } from './dates';
import { currentClass, mapAccount, mapCalendar, mapFinals, mapLessonsResponse, mapSubjects } from './map';
import { redactRaw } from './redact';
import { sanitize } from './sanitize';
import {
  enrichSubjects,
  mapBellSchedules,
  mapWeekTemplate,
  pickTimetable,
  roomFacts,
  studentTemplates,
} from './school';
import type { LessonRefs } from './school';
import {
  bellScheduleRaw,
  classTimetable,
  finalWholeResponse,
  loginResponse,
  meResponse,
  planningSubject,
  premise,
  schoolClass,
  schoolYearResponse,
  studentSubjectRow,
  timeActivity,
  weekActivity,
} from './schemas';
import type {
  BellScheduleRaw,
  ClassTimetable,
  PlanningSubject,
  Premise,
  SchoolClass,
  SchoolYearResponse,
  StudentSubjectRow,
  TimeActivity,
  WeekActivity,
} from './schemas';

// by-eschools: Belarus, diary.e-schools.by (docs/api-spec.md). Read-only, one login per run, every request through
// ctx.http. The week list, the calendar, classes and subjects are fetched once per session and reused, so a week of
// lessons costs one request. School details (6.7a, 6.10) are read once a day, when the collector asks for them.

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
  /** per student: what their lessons in this session said about their groups */
  refs: Map<string, { templates: Set<string>; teachers: Map<string, Set<string>> }>;
  bells: Map<string, BellScheduleRaw[]>;
  premises: Map<string, Premise[]>;
  timetables: Map<string, ClassTimetable[]>;
  planning: Map<string, PlanningSubject[]>;
  rows: Map<string, StudentSubjectRow[]>;
  /** students whose school details were read in this session: their subjects come back enriched */
  details: Set<string>;
}
const caches = new WeakMap<Session, SessionCache>();
function cacheOf(session: Session): SessionCache {
  let c = caches.get(session);
  if (!c) {
    c = {
      classes: new Map(),
      subjects: new Map(),
      refs: new Map(),
      bells: new Map(),
      premises: new Map(),
      timetables: new Map(),
      planning: new Map(),
      rows: new Map(),
      details: new Set(),
    };
    caches.set(session, c);
  }
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

async function classIdOf(session: Session, student: StudentRef, ctx: ProviderContext): Promise<string> {
  const classId = student.classExternalId ?? (await classOf(session, student, ctx))?.uuid;
  if (!classId || !student.schoolId) throw new ProviderSchemaError('classes: the student has no class');
  return classId;
}

/** Remembers which templates and teachers the student's lessons came from (their subgroups) */
function remember(session: Session, student: StudentRef, lessons: readonly Lesson[]) {
  const cache = cacheOf(session);
  let refs = cache.refs.get(student.externalId);
  if (!refs) cache.refs.set(student.externalId, (refs = { templates: new Set(), teachers: new Map() }));
  for (const l of lessons) {
    if (l.templateRef) refs.templates.add(l.templateRef);
    // a lesson's template says its group; its teacher only when it has none (a substitute may teach the other group)
    if (l.teacherExternalId && !l.templateRef) {
      const set = refs.teachers.get(l.subjectExternalId) ?? new Set<string>();
      refs.teachers.set(l.subjectExternalId, set.add(l.teacherExternalId));
    }
  }
}

/** The student's lesson references; reads the current week once when no lesson was read in this session yet */
async function refsOf(session: Session, student: StudentRef, ctx: ProviderContext): Promise<LessonRefs> {
  const cache = cacheOf(session);
  if (!cache.refs.has(student.externalId)) {
    const today = toISODate(ctx.now().getTime(), manifest.timezone);
    const [week] = await recentWeekRanges(session, ctx, today, 1);
    if (week) await byEschools.getLessons!(session, student, week, ctx);
    else remember(session, student, []);
  }
  return cache.refs.get(student.externalId)!;
}

const PREMISES_QUERY = JSON.stringify({
  expr: { units: [{ field: 'dt_delete', operator: 'ISNULL', operands: [] }], operator: 'AND' },
  sorting: { audience_number: 'ASC' },
});

/** The class's timetable for today (6.10.2): a class may have a quarter's and a half year's, see pickTimetable */
async function timetableOf(session: Session, student: StudentRef, ctx: ProviderContext) {
  const cache = cacheOf(session);
  const classId = await classIdOf(session, student, ctx);
  if (!cache.timetables.has(classId)) {
    const check = driftChecker(ctx.drift, 'timetables');
    const raw = await get(
      session,
      ctx,
      'timetables',
      `${DIARY}/schools/${seg(student.schoolId!)}/classes/${seg(classId)}/timetables/whole`,
    );
    cache.timetables.set(classId, check.items(classTimetable, raw, 'timetables'));
  }
  const { terms } = await byEschools.getCalendar(session, student, ctx);
  const today = toISODate(ctx.now().getTime(), manifest.timezone);
  return pickTimetable(cache.timetables.get(classId)!, terms, today, driftChecker(ctx.drift, 'timetables'));
}

async function schoolDetails(session: Session, student: StudentRef, ctx: ProviderContext) {
  const cache = cacheOf(session);
  const school = student.schoolId!;
  const classId = await classIdOf(session, student, ctx);
  if (!cache.planning.has(classId)) {
    const raw = await get(
      session,
      ctx,
      'planning',
      `${API}/education/planning/classes/${seg(classId)}/educational_subjects`,
    );
    cache.planning.set(classId, driftChecker(ctx.drift, 'planning').items(planningSubject, raw, 'planning'));
  }
  if (!cache.premises.has(school)) {
    const raw = await get(session, ctx, 'premises', `${API}/institution/schools/${seg(school)}/premises`, {
      q: PREMISES_QUERY,
    });
    cache.premises.set(school, driftChecker(ctx.drift, 'premises').items(premise, raw, 'premises'));
  }
  if (!cache.rows.has(student.externalId)) {
    const path = `${DIARY}/schools/${seg(school)}/students/${seg(student.externalId)}/classes/${seg(classId)}/subjects`;
    const raw = await get(session, ctx, 'student_subjects', path);
    cache.rows.set(
      student.externalId,
      driftChecker(ctx.drift, 'student_subjects').items(studentSubjectRow, raw, 'subjects'),
    );
  }
  return {
    planning: cache.planning.get(classId)!,
    premises: cache.premises.get(school)!,
    rows: cache.rows.get(student.externalId)!,
  };
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

/**
 * The last `count` school weeks that have started by `today`, oldest first: the current week (or during holidays
 * the last one) and the ones before it. Empty before the school year.
 */
export async function recentWeekRanges(session: Session, ctx: ProviderContext, today: string, count: number) {
  return (await weeksOf(session, ctx))
    .map((w) => dayRange({ start: w.start_ts, end: w.end_ts }, manifest.timezone))
    .filter((r) => r.from <= today)
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(-count);
}

/** For the probe: counts of the rooms in the student's own slots (after getWeekTemplate, from the session's cache) */
export async function roomFactsOf(session: Session, student: StudentRef, ctx: ProviderContext) {
  const details = await schoolDetails(session, student, ctx);
  const mine = studentTemplates(details.planning, await refsOf(session, student, ctx));
  return roomFacts(await timetableOf(session, student, ctx), mine, details.premises);
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
    let raw: unknown;
    try {
      raw = res.json();
    } catch {
      // an HTML page from a proxy or a maintenance screen is an outage, not a verdict on the password
      throw new ProviderUnavailableError('login: the answer is not JSON', res.status);
    }
    const check = driftChecker(ctx.drift, 'login');
    check.shape(loginResponse, raw);
    const tokens = loginResponse.safeParse(raw);
    // a 200 without a token is a refused login too: treating it as an outage would retry a bad password every hour
    if (!tokens.success) throw new ProviderAuthError('Login answered without a token');
    return { token: tokens.data.auth_token };
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
    // after the school details of the day: the student's teacher, group, level and lessons per week
    if (cached && cache.details.has(student.externalId)) {
      const d = await schoolDetails(session, student, ctx);
      const refs = await refsOf(session, student, ctx);
      return enrichSubjects(
        cached,
        d.rows,
        d.planning,
        studentTemplates(d.planning, refs),
        refs,
        driftChecker(ctx.drift, 'student_subjects'),
      );
    }
    if (cached) return cached;
    const path = `${await classPath(session, student, ctx)}/educational_subjects`;
    const subjects = mapSubjects(
      await get(session, ctx, 'educational_subjects', path),
      driftChecker(ctx.drift, 'educational_subjects'),
    );
    cache.subjects.set(student.externalId, subjects);
    return subjects;
  },

  async getBellSchedule(session, student, ctx) {
    const cache = cacheOf(session);
    const school = student.schoolId;
    if (!school) return [];
    if (!cache.bells.has(school)) {
      const raw = await get(session, ctx, 'bells', `${DIARY}/schools/${seg(school)}/bells/whole`);
      cache.bells.set(school, driftChecker(ctx.drift, 'bells').items(bellScheduleRaw, raw, 'bells'));
    }
    return mapBellSchedules(cache.bells.get(school)!, await timetableOf(session, student, ctx), student.grade);
  },

  async getWeekTemplate(session, student, ctx) {
    const timetable = await timetableOf(session, student, ctx);
    const refs = await refsOf(session, student, ctx);
    const details = await schoolDetails(session, student, ctx);
    cacheOf(session).details.add(student.externalId);
    if (!timetable) return null;
    const mine = studentTemplates(details.planning, refs);
    const subjects = await byEschools.getSubjects(session, student, ctx);
    const { terms } = await byEschools.getCalendar(session, student, ctx);
    return mapWeekTemplate(
      timetable,
      details.planning,
      details.rows,
      details.premises,
      mine,
      terms,
      new Map(subjects.map((x) => [x.externalId, x.name])),
    );
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
      out.push(...mapLessonsResponse(raw, manifest.timezone, check));
    }
    remember(session, student, out);
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
  redactRaw,
};
