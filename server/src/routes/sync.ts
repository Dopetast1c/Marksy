import { getProvider } from '@marksy/registry';
import { and, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { diaryAccounts, lessons, studentSources, syncRuns } from '../db/schema';
import { localTime } from '../sync/time';
import type { AppDeps } from '../http/context';
import { memberOf } from '../http/context';
import { route } from '../http/route';
import { registry } from '../openapi';
import { readSyncConfig } from '../sync/config';
import { visibleStudents } from './me';

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
            studentIds: active.filter((s) => s.accountId === a.id).map((s) => s.studentId),
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

  return r;
}
