import {
  addDays,
  createRunContext,
  daysBetween,
  maxDate,
  minDate,
  ProviderAuthError,
  ProviderBlockedError,
  ProviderNeeds2FAError,
  ProviderPolicyError,
  ProviderSchemaError,
  ProviderUnavailableError,
  weekStartOf,
} from '@marksy/core';
import type {
  Calendar,
  DateRange,
  DiaryProvider,
  DriftEvent,
  ISODate,
  Logger,
  MemoKind,
  ObservedResponse,
  Transport,
} from '@marksy/core';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { apiDriftEvents, bellSchedules, finalMarksRaw, rawResponses, syncCoverage, weekTemplates } from '../db/schema';
import { applySchoolDetails, storeBells, storeWeekTemplate } from './details';
import { massRemovalEndpoint } from './drift-scope';
import type { SyncErrorClass, SyncRunStats } from '../db/schema';
import { localTime } from './time';
import { forgetRead, readStampsOf, stampRead } from './cadence';
import { memoStore } from './memo';
import { readableStudents } from './readers';
import {
  loadCalendar,
  loadSubjectIds,
  storeCalendar,
  storeFinals,
  storeStudents,
  storeSubjects,
  studentRef,
} from './store-school';
import type { StoredCalendar, StudentRow } from './store-school';
import type { OpenedLogin } from './opened';
import { upsertRange } from './upsert';
import type { UpsertStats } from './upsert';

// One collector run against one diary account (docs/design.md 10): one login, the account, then per student the
// calendar and subjects, then the weeks the planner asked for in its order until the request budget is used. The
// account, the calendar and the school's reference data are read only when the children's settings or a change ask
// for them (RunReads, design.md 10.2); otherwise they come from the database. Every week is stored in its own
// transaction and marked verified in sync_coverage, so a run that dies halfway keeps what it finished. The collector
// never decides whether a run may start; server/src/sync/run.ts does (design 10.4).

/** Why a week is fetched; the order of these sets is the order of fetching (design 10.4) */
export type PlanSet = 'standing' | 'gap' | 'rescan' | 'backfill' | 'manual';
export const SET_ORDER: readonly PlanSet[] = ['standing', 'manual', 'gap', 'rescan', 'backfill'];

export interface WeekRequest {
  weekStart: ISODate;
  set: PlanSet;
}

export interface PlanInput {
  student: StudentRow;
  calendar: Calendar;
  stored: StoredCalendar;
  /** The school's local date */
  today: ISODate;
}

/** What one run reads besides its weeks, by the children's settings (design.md 10.2, run.ts) */
export interface RunReads {
  /** getAccount(): which children the login shows; otherwise the children stored for the account */
  account: boolean;
  /** Which of the children the account reads are read in this run (a scheduled run: those due now); default all */
  student?(s: StudentRow): boolean;
  /** This child's calendar (year, terms, holidays, class) is read; otherwise the stored one is used */
  calendar(s: StudentRow): Promise<boolean> | boolean;
  /** This child's subjects and school details (bells, regular week, rooms, teachers) are read */
  school(s: StudentRow): Promise<boolean> | boolean;
}

export interface CollectorOptions {
  db: Db;
  provider: DiaryProvider;
  account: { id: string; familyId: string; providerId: string };
  credentials: Record<string, string>;
  runId: string;
  /** The weeks to fetch for one student, in the planner's order, decided with the fresh calendar */
  plan(input: PlanInput): Promise<WeekRequest[]> | WeekRequest[];
  /**
   * Only the login and getAccount(): a source check of an account that reads none of its children. No calendar, no
   * weeks, no coverage (design.md 10.4)
   */
  accountOnly?: boolean;
  /** A login opened already (connecting a diary): no second login, no second getAccount() (sync/opened.ts) */
  opened?: OpenedLogin;
  /**
   * What this run reads besides its weeks (design.md 10.2). Absent: everything, as a first run does (and the account's
   * first run always does); what a run leaves out it takes from the database.
   */
  reads?: RunReads;
  /** Whether finals are fetched for this student in this run; default: once per local day */
  finalsDue?(input: PlanInput): Promise<boolean> | boolean;
  /**
   * Without `reads`: whether bells and the regular week are fetched for this student in this run; default: once per
   * local day. With `reads` they come with the school's reference data (RunReads.school)
   */
  detailsDue?(input: PlanInput): Promise<boolean> | boolean;
  transport?: Transport;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
  log?: Logger;
  /** Stricter limits from the environment */
  stricter?: { requestDelayMs?: [number, number]; maxRequestsPerRun?: number };
}

export interface CollectorResult {
  status: 'success' | 'partial' | 'failed';
  errorClass: SyncErrorClass | null;
  /** Sanitised: an error class name and a status, never a message from the provider */
  error: string | null;
  requests: number;
  stats: SyncRunStats;
  /** The children this run read (the account is their active source) */
  students: StudentRow[];
  verified: { studentId: string; weekStart: ISODate }[];
  /** Drift seen for the first time ever (the admin is told about these once) */
  newDrift: DriftEvent[];
}

/** Network failures after the connectivity check passed: fetch's TypeError, timeouts, resets */
const NETWORK_ERRORS = new Set(['TypeError', 'AbortError', 'TimeoutError']);

/** The failure class of design 10.4; null for our own bugs (a policy refusal, a database error), which never pause. */
export function classifyError(err: unknown): SyncErrorClass | null {
  if (err instanceof ProviderAuthError) return 'auth';
  if (err instanceof ProviderBlockedError) return 'blocked';
  if (err instanceof ProviderNeeds2FAError) return 'needs_2fa';
  // 5xx, 429, timeouts, resets after the connection was made: the diary is there but not answering properly
  if (err instanceof ProviderUnavailableError || err instanceof ProviderSchemaError) return 'provider_unavailable';
  if (err instanceof Error && NETWORK_ERRORS.has(err.name)) return 'provider_unavailable';
  return null;
}

function describeError(err: unknown): string {
  const name = err instanceof Error ? err.name : 'Error';
  return err instanceof ProviderUnavailableError && err.status ? `${name} ${err.status}` : name;
}

interface Unit {
  student: StudentRow;
  stored: StoredCalendar;
  subjectIds: Map<string, string>;
  range: DateRange;
  weeks: ISODate[];
  set: PlanSet;
  /** The end of the last term that finished before today: nothing dated up to it is removed (upsert.ts) */
  frozenUntil: ISODate | null;
}

/** The end of the last term that ended before today, or null (design.md 8: finished terms are frozen) */
export function frozenUntilOf(terms: readonly { end: ISODate }[], today: ISODate): ISODate | null {
  const ended = terms.map((t) => t.end).filter((end) => end < today);
  return ended.length ? ended.reduce((a, b) => (a > b ? a : b)) : null;
}

const emptyStats = (): UpsertStats => ({ lessons: 0, new: 0, changed: 0, removed: 0, restored: 0 });

function rawBody(text: string): unknown {
  try {
    // \u0000 cannot be stored in jsonb
    return JSON.parse(text.replace(/\\u0000/g, ''));
  } catch {
    return { text: text.slice(0, 10_000) };
  }
}

/** Drift rows keyed by (provider, endpoint, kind, path); returns the events never seen before. */
export async function storeDrift(
  db: Db,
  providerId: string,
  runId: string,
  events: readonly DriftEvent[],
  now: Date,
): Promise<DriftEvent[]> {
  const fresh: DriftEvent[] = [];
  for (const e of events) {
    const [row] = await db
      .insert(apiDriftEvents)
      .values({
        syncRunId: runId,
        providerId,
        endpoint: e.endpoint,
        kind: e.kind,
        path: e.path,
        sample: e.sample ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [apiDriftEvents.providerId, apiDriftEvents.endpoint, apiDriftEvents.kind, apiDriftEvents.path],
        set: { count: sql`${apiDriftEvents.count} + 1`, lastSeenAt: now, syncRunId: runId },
      })
      .returning({ count: apiDriftEvents.count });
    if (row!.count === 1) fresh.push(e);
  }
  return fresh;
}

export async function runCollector(opts: CollectorOptions): Promise<CollectorResult> {
  const { db, provider, account, runId } = opts;
  const manifest = provider.manifest;
  const caps = manifest.capabilities;
  const now = opts.now ?? (() => new Date());
  const maxRequests = Math.min(manifest.limits.maxRequestsPerRun, opts.stricter?.maxRequestsPerRun ?? Infinity);

  // raw bodies, tagged with what the collector was fetching when they came (the client is serial)
  const scope: { studentId: string | null; weekStart: ISODate | null } = { studentId: null, weekStart: null };
  const pending: (typeof rawResponses.$inferInsert)[] = [];
  const onResponse = (r: ObservedResponse) =>
    pending.push({
      syncRunId: runId,
      providerId: account.providerId,
      endpoint: r.endpoint,
      params: r.query,
      status: r.status,
      // the provider drops what it never maps (names, codes) before anything is stored
      body: provider.redactRaw ? provider.redactRaw(r.endpoint, rawBody(r.text)) : rawBody(r.text),
      studentId: scope.studentId,
      weekStart: scope.weekStart,
      fetchedAt: now(),
    });
  const flushRaw = async () => {
    if (pending.length) await db.insert(rawResponses).values(pending.splice(0));
  };

  const run =
    opts.opened?.run ??
    createRunContext(provider, {
      ...(opts.transport && { transport: opts.transport }),
      ...(opts.sleep && { sleep: opts.sleep }),
      ...(opts.random && { random: opts.random }),
      ...(opts.log && { log: opts.log }),
      ...(opts.stricter && { stricter: opts.stricter }),
      now,
      onResponse,
    });
  opts.opened?.observe(onResponse);
  const { ctx } = run;
  const stats: UpsertStats = emptyStats();
  const warnings: string[] = [];
  /** Record kinds the mass-removal guard held in this run (design.md 8) */
  const held = new Set<string>();
  const verified: CollectorResult['verified'] = [];
  let students: StudentRow[] = [];
  let failure: unknown;

  /** Children whose school reference data was read in this run, and those a fetched week showed it changed for */
  const schoolRead = new Set<string>();
  const unknownSubject = new Set<string>();
  /** Children whose calendar was read in this run, and those whose current school week came back without lessons */
  const calendarRead = new Set<string>();
  const emptyWeek = new Set<string>();

  try {
    const session = opts.opened ? opts.opened.session : await run.login(opts.credentials);
    const today = localTime(now(), manifest.timezone).date;
    const reads = opts.reads;
    // what this run reads again is decided per child before the account: the class is kept with the calendar
    const known = reads && !opts.opened ? await readableStudents(db, account.id) : [];
    const calendarDue = new Map<string, boolean>();
    const schoolDue = new Map<string, boolean>();
    if (reads) {
      for (const s of known) {
        calendarDue.set(s.id, await reads.calendar(s));
        schoolDue.set(s.id, await reads.school(s));
      }
    }
    const first = !reads || known.length === 0;
    const refresh = new Set<MemoKind>();
    if (first || [...calendarDue.values()].some(Boolean)) refresh.add('calendar');
    if (first || [...schoolDue.values()].some(Boolean)) refresh.add('school');
    run.useMemo(memoStore(db, account.id, refresh, now));

    if (opts.accountOnly || opts.opened || first || reads?.account) {
      const info = opts.opened ? opts.opened.info : await provider.getAccount(session, ctx);
      // every listed child is stored and linked; only those this account is the active source of are read
      students = (await storeStudents(db, account, info, now())).readable;
    } else students = known;
    if (opts.accountOnly) students = [];
    if (reads?.student) students = students.filter((s) => reads.student!(s));

    const units: Unit[] = [];
    const finals: { student: StudentRow; stored: StoredCalendar; subjectIds: Map<string, string> }[] = [];
    const details: typeof finals = [];
    const years = new Map<string, { from: ISODate; to: ISODate }>();
    // bells and the regular week come after the lessons; without them a provider's subjects are complete
    const dailyDetails = caps.bellSchedule || caps.weekTemplate;
    for (const student of students) {
      scope.studentId = student.id;
      const ref = studentRef(student);
      // a child the account did not list before is read in full
      const kept = reads && !(calendarDue.get(student.id) ?? true) ? await loadCalendar(db, student.id, today) : null;
      let calendar: Calendar;
      let stored: StoredCalendar;
      if (kept) ({ calendar, stored } = kept);
      else {
        calendar = await provider.getCalendar(session, ref, ctx);
        stored = await storeCalendar(db, manifest, student, calendar);
        await stampRead(db, student.id, 'calendar', now());
        calendarRead.add(student.id);
      }
      const readSchool = !reads || (schoolDue.get(student.id) ?? true);
      let subjectIds: Map<string, string>;
      if (readSchool) {
        subjectIds = await storeSubjects(
          db,
          student,
          stored.schoolYearId,
          await provider.getSubjects(session, ref, ctx),
          { details: !dailyDetails },
        );
        schoolRead.add(student.id);
        // without school details the subjects are all of it
        if (!dailyDetails) await stampRead(db, student.id, 'school', now());
      } else subjectIds = await loadSubjectIds(db, student.id, stored.schoolYearId);
      years.set(student.id, { from: calendar.schoolYear.start, to: calendar.schoolYear.end });
      const input: PlanInput = { student, calendar, stored, today };
      units.push(
        ...unitsFor(input, await opts.plan(input), subjectIds, manifest.limits.fetchUnit, manifest.calendar.weekStart),
      );
      if (caps.finalMarks && (await (opts.finalsDue ?? finalsOncePerDay(db, manifest.timezone, now))(input))) {
        finals.push({ student, stored, subjectIds });
      }
      const detailsDue = reads
        ? readSchool
        : await (opts.detailsDue ?? detailsOncePerDay(db, manifest.timezone, now))(input);
      if (dailyDetails && detailsDue) details.push({ student, stored, subjectIds });
    }
    await flushRaw();
    const currentWeek = weekStartOf(today, manifest.calendar.weekStart);

    // the planner's order across students: every student's standing weeks before anyone's gap
    units.sort((a, b) => SET_ORDER.indexOf(a.set) - SET_ORDER.indexOf(b.set));
    const standing = units.filter((u) => u.set === 'standing');
    const rest = units.filter((u) => u.set !== 'standing');
    const cost = manifest.limits.fetchUnit === 'day' ? 6 : 1;

    const fetchUnit = async (u: Unit): Promise<boolean> => {
      if (ctx.http.requestCount + cost > maxRequests) return false;
      scope.studentId = u.student.id;
      scope.weekStart = u.weeks[0] ?? null;
      const ref = studentRef(u.student);
      let keepBody: boolean;
      const subjectsBefore = u.subjectIds.size;
      try {
        const lessons = caps.lessons ? await provider.getLessons!(session, ref, u.range, ctx) : [];
        // the child's school week came back without a lesson: holidays the stored calendar does not know (a quarantine)
        if (caps.lessons && u.set === 'standing' && u.weeks[0] === currentWeek && lessons.length === 0)
          emptyWeek.add(u.student.id);
        const marks =
          caps.marksPerLesson === 'none' || caps.unattachedMarks
            ? await provider.getMarks!(session, ref, u.range, ctx)
            : [];
        const attendance =
          caps.attendance === 'separate' ? await provider.getAttendance!(session, ref, u.range, ctx) : [];
        const behaviour = caps.behaviour === 'separate' ? await provider.getBehaviour!(session, ref, u.range, ctx) : [];
        const s = await upsertRange(
          db,
          {
            studentId: u.student.id,
            providerId: account.providerId,
            schoolYearId: u.stored.schoolYearId,
            subjectIds: u.subjectIds,
            now: now(),
            frozenUntil: u.frozenUntil,
          },
          { range: u.range, lessons, marks, attendance, behaviour },
        );
        for (const k of Object.keys(stats) as (keyof UpsertStats)[]) stats[k] += s[k];
        // a subject the stored list did not know: the school's reference data has changed
        if (u.subjectIds.size > subjectsBefore) unknownSubject.add(u.student.id);
        if (s.held.length) {
          // the response would have removed all or many records: nothing was removed, the week stays unverified and
          // is asked for again tomorrow (design.md 8, 10.4); the admin hears of the first one (drift)
          for (const table of s.held) held.add(table);
          warnings.push(`held ${u.weeks[0]}`);
          const at = now();
          for (const weekStart of u.weeks) {
            await db
              .insert(syncCoverage)
              .values({ studentId: u.student.id, weekStart, verifiedAt: at, runId, status: 'failed', heldAt: at })
              .onConflictDoUpdate({ target: [syncCoverage.studentId, syncCoverage.weekStart], set: { heldAt: at } });
          }
          return true;
        }
        keepBody = s.frozenMissing > 0;
      } catch (err) {
        // a response that cannot be used at all: the week stays unverified, the rest of the run goes on
        if (err instanceof ProviderSchemaError) {
          warnings.push(`schema ${u.weeks[0]}`);
          return true;
        }
        // the budget ran out inside a unit: stop quietly, the week is first in line next time
        if (err instanceof ProviderPolicyError && ctx.http.requestCount >= maxRequests) return false;
        throw err;
      } finally {
        await flushRaw();
      }
      const at = now();
      for (const weekStart of u.weeks) {
        await db
          .insert(syncCoverage)
          .values({ studentId: u.student.id, weekStart, verifiedAt: at, runId, status: 'verified' })
          .onConflictDoUpdate({
            target: [syncCoverage.studentId, syncCoverage.weekStart],
            // a response that lost frozen records verifies the week but leaves the kept body to the earlier run
            set: { verifiedAt: at, status: 'verified', heldAt: null, ...(!keepBody && { runId }) },
          });
        verified.push({ studentId: u.student.id, weekStart });
      }
      return true;
    };

    for (const u of standing) if (!(await fetchUnit(u))) break;
    for (const f of finals) {
      if (ctx.http.requestCount + 1 > maxRequests) break;
      scope.studentId = f.student.id;
      scope.weekStart = null;
      const from = pending.length;
      const list = await provider.getFinalMarks!(session, studentRef(f.student), ctx);
      // the response itself is kept with the finals, so a mapping fixed later reads it again (mapStoredFinals)
      const response = pending
        .slice(from)
        .map((p) => ({ endpoint: p.endpoint, body: p.body, status: p.status }))
        .find((p) => p.status === 200 && provider.mapStoredFinals?.(p, { subjects: [], terms: [] }) != null);
      const raw = response ? { endpoint: response.endpoint, body: response.body } : null;
      await storeFinals(db, f.student, f.stored, f.subjectIds, list, now(), raw);
      await flushRaw();
    }
    // school details of the day, after the lessons (a provider may need them to tell the child's subgroups): bells, the
    // regular week, then the subjects again with teacher, subgroup and level (docs/providers.md 4)
    for (const d of details) {
      if (ctx.http.requestCount + 1 > maxRequests) break;
      scope.studentId = d.student.id;
      scope.weekStart = null;
      const ref = studentRef(d.student);
      try {
        if (caps.bellSchedule) {
          await storeBells(
            db,
            d.student,
            d.stored.schoolYearId,
            await provider.getBellSchedule!(session, ref, ctx),
            now(),
          );
        }
        if (caps.weekTemplate) {
          const template = await provider.getWeekTemplate!(session, ref, ctx);
          await storeWeekTemplate(db, d.student, d.stored, d.subjectIds, template, now());
        }
        await storeSubjects(db, d.student, d.stored.schoolYearId, await provider.getSubjects(session, ref, ctx), {
          details: true,
        });
        await stampRead(db, d.student.id, 'school', now());
        schoolRead.add(d.student.id);
      } catch (err) {
        if (err instanceof ProviderSchemaError) warnings.push('schema details');
        else if (err instanceof ProviderPolicyError && ctx.http.requestCount >= maxRequests) break;
        else throw err;
      } finally {
        await flushRaw();
      }
    }
    for (const u of rest) if (!(await fetchUnit(u))) break;
    // what the regular week and the bells add to the lessons: room, subgroup, teacher, end time
    for (const student of students) {
      const year = years.get(student.id);
      if (year) await applySchoolDetails(db, student.id, year);
    }
    // what the weeks showed has changed is read by the next run (design.md 10.2); a calendar read today already, or a
    // school read in this run, is not read again for it
    for (const id of unknownSubject) if (!schoolRead.has(id)) await forgetRead(db, id, 'school');
    for (const id of emptyWeek) {
      if (calendarRead.has(id)) continue;
      const { calendar: at } = await readStampsOf(db, id);
      if (!at || localTime(at, manifest.timezone).date !== today) await forgetRead(db, id, 'calendar');
    }
  } catch (err) {
    failure = err;
    opts.log?.warn('sync run failed', { reason: describeError(err) });
  } finally {
    await flushRaw().catch(() => undefined);
  }

  // a hold is about this account's diary, not the provider's API: its row is the account's own (massRemovalEndpoint),
  // so another family on the same provider never sees it
  const heldDrift: DriftEvent[] = [...held].map((path) => ({
    kind: 'mass_removal',
    endpoint: massRemovalEndpoint(account.id),
    path,
  }));
  const newDrift = await storeDrift(db, account.providerId, runId, [...run.drift.events, ...heldDrift], now());
  const result: CollectorResult = {
    status: 'success',
    errorClass: null,
    error: null,
    requests: ctx.http.requestCount,
    stats: {
      weeks_verified: verified.length,
      lessons: stats.lessons,
      new: stats.new,
      changed: stats.changed,
      removed: stats.removed,
      restored: stats.restored,
      drift: run.drift.events.length + heldDrift.length,
      ...(warnings.length && { warnings }),
    },
    students,
    verified,
    newDrift,
  };
  if (failure !== undefined) {
    const cls = classifyError(failure);
    // finished weeks are kept; a run that verified something before the provider failed is partial
    const partial = verified.length > 0 && cls === 'provider_unavailable';
    result.status = partial ? 'partial' : 'failed';
    result.errorClass = partial ? 'partial' : cls;
    result.error = describeError(failure);
  }
  return result;
}

/** The units of one student: a week each, or whole terms for providers that hand data out per term. */
function unitsFor(
  input: PlanInput,
  requests: WeekRequest[],
  subjectIds: Map<string, string>,
  fetchUnit: 'week' | 'day' | 'term',
  weekStart: number,
): Unit[] {
  const year = input.calendar.schoolYear;
  const clip = (r: DateRange): DateRange => ({ from: maxDate(r.from, year.start), to: minDate(r.to, year.end) });
  const base = {
    student: input.student,
    stored: input.stored,
    subjectIds,
    frozenUntil: frozenUntilOf(input.calendar.terms, input.today),
  };
  if (fetchUnit !== 'term') {
    return requests.map((r) => ({
      ...base,
      range: clip({ from: r.weekStart, to: addDays(r.weekStart, 6) }),
      weeks: [r.weekStart],
      set: r.set,
    }));
  }
  // one request covers a term (or the year when there are no terms); every week inside it is verified with it
  const spans = input.calendar.terms.length
    ? input.calendar.terms.map((t) => ({ from: t.start, to: t.end }))
    : [{ from: year.start, to: year.end }];
  const out: Unit[] = [];
  const done = new Set<number>();
  for (const r of requests) {
    const i = spans.findIndex((s) => r.weekStart <= s.to && addDays(r.weekStart, 6) >= s.from);
    if (i < 0 || done.has(i)) continue;
    done.add(i);
    const range = clip(spans[i]!);
    const weeks: ISODate[] = [];
    const first = weekStartOf(range.from, weekStart);
    for (let w = first; daysBetween(w, range.to) >= 0; w = addDays(w, 7)) weeks.push(w);
    out.push({ ...base, range, weeks, set: r.set });
  }
  return out;
}

function detailsOncePerDay(db: Db, timeZone: string, now: () => Date) {
  return async ({ student }: PlanInput) => {
    const [bells] = await db
      .select({ at: bellSchedules.fetchedAt })
      .from(bellSchedules)
      .where(eq(bellSchedules.studentId, student.id))
      .limit(1);
    const [week] = await db
      .select({ at: weekTemplates.fetchedAt })
      .from(weekTemplates)
      .where(eq(weekTemplates.studentId, student.id))
      .limit(1);
    const at = bells?.at ?? week?.at;
    return !at || localTime(at, timeZone).date !== localTime(now(), timeZone).date;
  };
}

function finalsOncePerDay(db: Db, timeZone: string, now: () => Date) {
  return async ({ student, stored }: PlanInput) => {
    const [row] = await db
      .select({ fetchedAt: finalMarksRaw.fetchedAt })
      .from(finalMarksRaw)
      .where(and(eq(finalMarksRaw.studentId, student.id), eq(finalMarksRaw.schoolYearId, stored.schoolYearId)));
    return !row || localTime(row.fetchedAt, timeZone).date !== localTime(now(), timeZone).date;
  };
}
