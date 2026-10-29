import { getProvider } from '@marksy/registry';
import { addDays } from '@marksy/core';
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import {
  apiDriftAcks,
  apiDriftEvents,
  diaryAccounts,
  lessons,
  schoolYears,
  studentSources,
  syncCoverage,
  syncRuns,
  terms,
} from '../db/schema';
import { localTime } from '../sync/time';
import type { AppDeps } from '../http/context';
import { inBackground, memberOf } from '../http/context';
import { HttpError } from '../http/errors';
import { runSync } from '../sync/run';
import { route } from '../http/route';
import { registry } from '../openapi';
import { readSyncConfig } from '../sync/config';
import { syncPlanOf, syncPlanOut } from '../sync/status';
import { visibleStudents } from './me';
import { mayStartRun } from '../runtime/instance';

// Синхронизация (docs/design.md 9, 10.4): how fresh each diary account of the family is, «загружаем» while a run (the
// first sync after connecting) is under way, when the next login is allowed; and per child whether it is read through
// this family's login or another family's, with no detail of the other family. The history of runs for adults.

const accountStatus = z.enum(['loading', 'ok', 'stale', 'paused', 'auth_failed', 'blocked', 'needs_2fa']);

/**
 * Is the data of these children stale (ux-principles D22, D55)? Only when a school day of theirs passed since the last
 * successful read: a day with their lessons after that read and before today. A weekend or holidays never count, so a
 * Monday morning is not an alarm. Children whose diary has no lessons at all fall back to the catch-up age.
 */
export async function missedSchoolDay(
  deps: AppDeps,
  studentIds: readonly string[],
  lastSuccessAt: Date | null,
  now: Date,
  timezone: string,
  catchupAfterMs: number,
): Promise<boolean> {
  if (!lastSuccessAt) return true;
  if (!studentIds.length) return now.getTime() - lastSuccessAt.getTime() > catchupAfterMs;
  const anyLesson = await deps.db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(inArray(lessons.studentId, [...studentIds]), isNull(lessons.removedAt)))
    .limit(1);
  if (!anyLesson.length) return now.getTime() - lastSuccessAt.getTime() > catchupAfterMs;
  const missed = await deps.db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        inArray(lessons.studentId, [...studentIds]),
        isNull(lessons.removedAt),
        gt(lessons.date, localTime(lastSuccessAt, timezone).date),
        lt(lessons.date, localTime(now, timezone).date),
      ),
    )
    .limit(1);
  return missed.length > 0;
}

export function syncRoutes(deps: AppDeps): Router {
  const r = Router();
  const config = () => deps.syncConfig ?? readSyncConfig();

  route(
    r,
    {
      method: 'get',
      path: '/api/sync/status',
      summary: 'How fresh the data is: per diary account of the family, and per child',
      tags: ['sync'],
      access: 'member',
      response: registry.register(
        'SyncStatus',
        z.object({
          accounts: z.array(
            z.object({
              id: z.string(),
              providerId: z.string(),
              providerName: z.string(),
              /** the diary login, as the family sees it in Семья; null for a student (design.md 7.6) */
              label: z.string().nullable(),
              status: accountStatus,
              lastSuccessAt: z.date().nullable(),
              lastAttemptAt: z.date().nullable(),
              lastRun: z
                .object({
                  kind: z.string(),
                  status: z.string(),
                  errorClass: z.string().nullable(),
                  startedAt: z.date(),
                  finishedAt: z.date().nullable(),
                })
                .nullable(),
              consecutiveFailures: z.number(),
              pausedUntil: z.date().nullable(),
              nextAllowedAt: z.date().nullable(),
              /** The children this login reads now */
              studentIds: z.array(z.string()),
              /** the planner's view: window, next run and why, what it takes, re-scan, drift (status.ts) */
              plan: syncPlanOut.nullable(),
            }),
          ),
          students: z.array(
            z.object({
              id: z.string(),
              /** own: through this family's login; otherFamily: another family's login reads the child */
              readThrough: z.enum(['own', 'otherFamily', 'none']),
              lastSuccessAt: z.date().nullable(),
              /** A school day of the child passed since the last read (the freshness banner, D22, D55) */
              stale: z.boolean(),
            }),
          ),
        }),
      ),
    },
    async (req) => {
      const m = memberOf(req);
      const now = deps.now?.() ?? new Date();
      const accounts = await deps.db.select().from(diaryAccounts).where(eq(diaryAccounts.familyId, m.familyId));
      const ids = accounts.map((a) => a.id);
      const runs = ids.length
        ? await deps.db
            .select()
            .from(syncRuns)
            .where(inArray(syncRuns.diaryAccountId, ids))
            .orderBy(desc(syncRuns.startedAt))
        : [];
      const kids = (await visibleStudents(deps.db, m.userId, m.familyId)).map((k) => k.student.id);
      const student = m.role === 'student';
      const visiblePlan = (p: Awaited<ReturnType<typeof syncPlanOf>> | null) =>
        p && { ...p, windowStudentIds: p.windowStudentIds.filter((id) => kids.includes(id)) };
      const active = kids.length
        ? await deps.db
            .select({
              studentId: studentSources.studentId,
              accountId: studentSources.diaryAccountId,
              familyId: diaryAccounts.familyId,
              providerId: diaryAccounts.providerId,
              lastSuccessAt: diaryAccounts.lastSuccessAt,
            })
            .from(studentSources)
            .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
            .where(and(inArray(studentSources.studentId, kids), eq(studentSources.active, true)))
        : [];
      const cfg = config();
      const staleOf = new Map<string, boolean>();
      for (const a of accounts) {
        const tz = getProvider(a.providerId)?.manifest.timezone ?? 'UTC';
        const reads = active.filter((s) => s.accountId === a.id).map((s) => s.studentId);
        staleOf.set(a.id, await missedSchoolDay(deps, reads, a.lastSuccessAt, now, tz, cfg.catchupAfterMs));
      }
      const studentStale = new Map<string, boolean>();
      for (const id of kids) {
        const src = active.find((s) => s.studentId === id);
        // a child no login reads is not stale: there is nothing to read them through (the fictional demo family)
        if (!src) {
          studentStale.set(id, false);
          continue;
        }
        const tz = getProvider(src.providerId)?.manifest.timezone ?? 'UTC';
        studentStale.set(id, await missedSchoolDay(deps, [id], src.lastSuccessAt, now, tz, cfg.catchupAfterMs));
      }
      const plans = new Map<string, Awaited<ReturnType<typeof syncPlanOf>>>();
      for (const a of accounts) {
        const manifest = getProvider(a.providerId)?.manifest;
        if (manifest) plans.set(a.id, await syncPlanOf(deps.db, a, manifest, cfg, now));
      }
      return {
        accounts: accounts.map((a) => {
          const own = runs.filter((x) => x.diaryAccountId === a.id);
          const last = own[0];
          const manifest = getProvider(a.providerId)?.manifest;
          const lastLogin = [a.lastAttemptAt, a.lastLoginAt].filter((d): d is Date => !!d).sort((x, y) => +y - +x)[0];
          const interval = (manifest?.limits.minLoginIntervalMinutes ?? 60) * 60_000;
          const status = own.some((x) => x.status === 'running')
            ? 'loading'
            : a.requiresAction === 'auth'
              ? 'auth_failed'
              : a.requiresAction === 'blocked'
                ? 'blocked'
                : a.requiresAction === 'needs_2fa'
                  ? 'needs_2fa'
                  : a.pausedUntil && a.pausedUntil > now
                    ? 'paused'
                    : staleOf.get(a.id)
                      ? 'stale'
                      : 'ok';
          return {
            id: a.id,
            providerId: a.providerId,
            providerName: manifest?.name ?? a.providerId,
            label: student ? null : a.label,
            status,
            lastSuccessAt: a.lastSuccessAt,
            lastAttemptAt: a.lastAttemptAt,
            lastRun: last
              ? {
                  kind: last.kind,
                  status: last.status,
                  errorClass: last.errorClass,
                  startedAt: last.startedAt,
                  finishedAt: last.finishedAt,
                }
              : null,
            consecutiveFailures: a.consecutiveFailures,
            pausedUntil: a.pausedUntil,
            nextAllowedAt: lastLogin ? new Date(Math.max(lastLogin.getTime() + interval, now.getTime())) : null,
            // only the children this person sees; the planner view is the adults' (5.6)
            studentIds: active
              .filter((s) => s.accountId === a.id && kids.includes(s.studentId))
              .map((s) => s.studentId),
            plan: student ? null : visiblePlan(plans.get(a.id) ?? null),
          };
        }),
        students: kids.map((id) => {
          const src = active.find((s) => s.studentId === id);
          return {
            id,
            readThrough: !src ? 'none' : src.familyId === m.familyId ? 'own' : 'otherFamily',
            lastSuccessAt: src?.lastSuccessAt ?? null,
            stale: studentStale.get(id) ?? true,
          };
        }),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/sync/runs',
      summary: 'The latest sync runs of the family’s diary accounts (admin, parent)',
      tags: ['sync'],
      access: { roles: ['admin', 'parent'] },
      query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(30) }),
      response: z.array(
        z.object({
          id: z.string(),
          accountId: z.string(),
          kind: z.string(),
          /** schedule, startup, cli, cli-claude, or user: a person (never which one) */
          trigger: z.string(),
          status: z.string(),
          errorClass: z.string().nullable(),
          requests: z.number(),
          startedAt: z.date(),
          finishedAt: z.date().nullable(),
          stats: z.record(z.string(), z.unknown()),
        }),
      ),
    },
    async (req, { query }) => {
      const m = memberOf(req);
      const rows = await deps.db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.familyId, m.familyId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(query.limit);
      return rows.map((x) => ({
        id: x.id,
        accountId: x.diaryAccountId,
        kind: x.kind,
        trigger: x.trigger.startsWith('user:') ? 'user' : x.trigger,
        status: x.status,
        errorClass: x.errorClass,
        requests: x.requests,
        startedAt: x.startedAt,
        finishedAt: x.finishedAt,
        stats: x.stats,
      }));
    },
  );

  /** The family's account by id, or 404 */
  const accountOf = async (familyId: string, id: string) => {
    const [a] = await deps.db
      .select()
      .from(diaryAccounts)
      .where(and(eq(diaryAccounts.id, id), eq(diaryAccounts.familyId, familyId)));
    if (!a) throw new HttpError(404, 'not_found', 'No such diary account');
    return a;
  };

  /**
   * «Обновить сейчас»: one run of the account, drawing from the same login budget as every other run (design.md 10.4).
   * The run goes on after the answer; the answer says whether it starts, and when the next login is allowed if not.
   */
  const refresh = async (userId: string, a: typeof diaryAccounts.$inferSelect) => {
    // a login without credentials is the demo family's (seed/demo-sync.ts): there is nothing to read it with
    if (!a.credentialsEnc) return { started: false, reason: 'demo' as const, retryAt: null };
    const now = deps.now?.() ?? new Date();
    // switched off on this instance (after a restore, until `marksy sync enable`) or held for an update
    if (!(await mayStartRun(deps.db, now))) return { started: false, reason: 'off' as const, retryAt: null };
    const interval = (getProvider(a.providerId)?.manifest.limits.minLoginIntervalMinutes ?? 60) * 60_000;
    const last = [a.lastAttemptAt, a.lastLoginAt].filter((d): d is Date => !!d).sort((x, y) => +y - +x)[0];
    const retryAt = last && last.getTime() + interval > now.getTime() ? new Date(last.getTime() + interval) : null;
    // the run records its own decision (a skipped row for a manual try), so the log says what happened either way
    inBackground(
      deps,
      runSync({
        db: deps.db,
        accountId: a.id,
        trigger: `user:${userId}`,
        config: config(),
        credentialsKey: deps.credentialsKey,
        ...(deps.transportFor?.(a.providerId) && { transport: deps.transportFor(a.providerId)! }),
        ...(deps.now && { now: deps.now }),
        ...(deps.sleep && { sleep: deps.sleep }),
        ...(deps.log && { log: deps.log }),
      }),
    );
    if (a.requiresAction) return { started: false, reason: 'action' as const, retryAt: null };
    if (retryAt) return { started: false, reason: 'interval' as const, retryAt };
    return { started: true, reason: null, retryAt: null };
  };
  const refreshOut = z.object({
    started: z.boolean(),
    /**
     * interval: the login budget; action: the diary refused the login, a new password first; demo: never read; off: the
     * collector is switched off on this instance (after a restore) or held for an update
     */
    reason: z.enum(['interval', 'action', 'demo', 'off']).nullable(),
    retryAt: z.date().nullable(),
  });

  route(
    r,
    {
      method: 'post',
      path: '/api/sync/run',
      summary: '«Обновить сейчас»: one run of a diary account within its login budget (admin, parent)',
      tags: ['sync'],
      access: { roles: ['admin', 'parent'] },
      body: z.object({ accountId: z.string().uuid() }),
      response: refreshOut,
      errors: { 404: 'No such diary account' },
    },
    async (req, { body }) => {
      const m = memberOf(req);
      return refresh(m.userId, await accountOf(m.familyId, body.accountId));
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/sync/rescan',
      summary:
        '«Перепроверить»: the weeks of the current term or school year are read again by the next runs, then one run now',
      tags: ['sync'],
      access: { roles: ['admin', 'parent'] },
      body: z.object({
        accountId: z.string().uuid(),
        /** none: every child the login reads */
        studentIds: z.array(z.string().uuid()).optional(),
        period: z.enum(['term', 'year']),
      }),
      response: refreshOut.extend({ weeks: z.number() }),
      errors: { 404: 'No such diary account' },
    },
    async (req, { body }) => {
      const m = memberOf(req);
      const a = await accountOf(m.familyId, body.accountId);
      // the demo's weeks stay checked: nothing would ever read them again
      if (!a.credentialsEnc) return { ...(await refresh(m.userId, a)), weeks: 0 };
      const read = await deps.db
        .select({ studentId: studentSources.studentId })
        .from(studentSources)
        .where(and(eq(studentSources.diaryAccountId, a.id), eq(studentSources.active, true)));
      // only children this person sees (a parent may see some of the family's children)
      const seen = new Set((await visibleStudents(deps.db, m.userId, m.familyId)).map((k) => k.student.id));
      const kids = read
        .map((x) => x.studentId)
        .filter((id) => seen.has(id) && (!body.studentIds || body.studentIds.includes(id)));
      // the weeks lose their check: the planner reads them again, the freshest first, as it reads any unverified
      // week (design.md 10.4); history is never overwritten silently, a changed mark still becomes a mark event
      let weeks = 0;
      const tz = getProvider(a.providerId)?.manifest.timezone ?? 'UTC';
      const today = localTime(deps.now?.() ?? new Date(), tz).date;
      for (const studentId of kids) {
        const [year] = await deps.db
          .select()
          .from(schoolYears)
          .where(
            and(
              eq(schoolYears.studentId, studentId),
              lte(schoolYears.startDate, today),
              gte(schoolYears.endDate, today),
            ),
          );
        if (!year) continue;
        let from = year.startDate;
        if (body.period === 'term') {
          const [term] = await deps.db
            .select()
            .from(terms)
            .where(and(eq(terms.schoolYearId, year.id), lte(terms.startDate, today), gte(terms.endDate, today)));
          if (term) from = term.startDate;
        }
        const gone = await deps.db
          .delete(syncCoverage)
          .where(
            and(
              eq(syncCoverage.studentId, studentId),
              gte(syncCoverage.weekStart, addDays(from, -6)),
              lte(syncCoverage.weekStart, today),
            ),
          )
          .returning();
        weeks += gone.length;
      }
      return { ...(await refresh(m.userId, a)), weeks };
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/sync/drift/:id/ack',
      summary: '«Понятно, скрыть» for a change in the diary’s API (admin, parent)',
      tags: ['sync'],
      access: { roles: ['admin', 'parent'] },
      params: z.object({ id: z.string().uuid() }),
      status: 204,
      response: null,
      errors: { 404: 'No such change for the family’s diaries' },
    },
    async (req, { params }) => {
      const m = memberOf(req);
      const providers = (
        await deps.db
          .select({ p: diaryAccounts.providerId })
          .from(diaryAccounts)
          .where(eq(diaryAccounts.familyId, m.familyId))
      ).map((x) => x.p);
      const [event] = providers.length
        ? await deps.db
            .select({ id: apiDriftEvents.id })
            .from(apiDriftEvents)
            .where(and(eq(apiDriftEvents.id, params.id), inArray(apiDriftEvents.providerId, providers)))
        : [];
      if (!event) throw new HttpError(404, 'not_found', 'No such change');
      // hidden for this family only
      await deps.db
        .insert(apiDriftAcks)
        .values({ familyId: m.familyId, driftEventId: event.id, acknowledgedAt: deps.now?.() ?? new Date() })
        .onConflictDoNothing();
    },
  );

  return r;
}
