import type { ProviderManifest } from '@marksy/core';
import { and, eq, gte, inArray, isNull, lte, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import {
  apiDriftAcks,
  apiDriftEvents,
  diaryAccounts,
  schoolYears,
  syncCoverage,
  termRescans,
  terms,
} from '../db/schema';
import { accountPlan } from './account-plan';
import type { SyncConfig } from './config';
import { fromLocal } from './time';

// Синхронизация (docs/design.md 5.6, 10.4): what the state card of one diary account says beyond its last run, from
// the planner's own view (accountPlan): today's window and whose school day makes it, when the next run comes and why,
// what it will take, the re-scan of the current term, and the diary's API drift (kind and place only: the sanitised
// samples stay in the database). Nothing here logs in.

export const syncPlanOut = z.object({
  /** today's window of the account (the union of its children's), local times; null: no school day today */
  window: z.object({ from: z.string(), to: z.string() }).nullable(),
  /** the children whose school day makes it */
  windowStudentIds: z.array(z.string()),
  /**
   * now: would start now; soon: in the next minutes (the random offset); at: at that moment (the login interval, the
   * window opening, the pause ending); nextSchoolDay: in the next school day's window; action: after a new password or
   * code; offline: when this computer is online again
   */
  next: z.object({
    kind: z.enum(['now', 'soon', 'at', 'nextSchoolDay', 'action', 'offline', 'paused']),
    at: z.date().nullable(),
  }),
  /** weeks waiting per set (standing, gap, rescan, post_term, backfill), all children together */
  sets: z.record(z.string(), z.number()),
  maxRequestsPerRun: z.number(),
  /** the current term's re-scan: the last time every week was checked, the oldest check of a week */
  rescan: z.object({ lastFullAt: z.date().nullable(), oldestVerifiedAt: z.date().nullable() }),
  drift: z.array(
    z.object({
      id: z.string(),
      endpoint: z.string(),
      kind: z.string(),
      path: z.string(),
      firstSeenAt: z.date(),
      lastSeenAt: z.date(),
      count: z.number(),
    }),
  ),
});

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export async function syncPlanOf(
  db: Db,
  account: typeof diaryAccounts.$inferSelect,
  manifest: ProviderManifest,
  config: SyncConfig,
  now: Date,
): Promise<z.infer<typeof syncPlanOut>> {
  const plan = await accountPlan(db, account, manifest, config, now);
  const { today, decision, local } = plan;
  const windows = today.windows;
  const window = windows.length ? { from: hhmm(windows[0]![0]), to: hhmm(windows.at(-1)![1]) } : null;
  let next: z.infer<typeof syncPlanOut>['next'];
  if (decision.start) next = { kind: 'now', at: null };
  else
    switch (decision.reason) {
      case 'interval':
        next = { kind: 'at', at: decision.retryAt ?? null };
        break;
      case 'paused':
        next = { kind: 'paused', at: decision.retryAt ?? null };
        break;
      case 'requires_action':
        next = { kind: 'action', at: null };
        break;
      case 'offline_retry':
        next = { kind: 'offline', at: null };
        break;
      case 'jitter':
        next = { kind: 'soon', at: null };
        break;
      default: {
        // outside the window: today's opens later, or the next school day's
        const later = windows.find((w) => w[0] > local.minutes);
        next = later
          ? { kind: 'at', at: fromLocal(local.date, later[0], manifest.timezone) }
          : { kind: 'nextSchoolDay', at: null };
      }
    }
  const sets: Record<string, number> = {};
  for (const c of today.children) for (const [k, n] of Object.entries(c.sets)) sets[k] = (sets[k] ?? 0) + (n ?? 0);

  const kids = plan.sourceCheck ? [] : plan.readable;
  let rescan = { lastFullAt: null as Date | null, oldestVerifiedAt: null as Date | null };
  if (kids.length) {
    const current = await db
      .select({ termId: terms.id, studentId: schoolYears.studentId, start: terms.startDate, end: terms.endDate })
      .from(terms)
      .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
      .where(
        and(inArray(schoolYears.studentId, kids), lte(terms.startDate, local.date), gte(terms.endDate, local.date)),
      );
    if (current.length) {
      const done = await db
        .select({ at: min(termRescans.lastFullRescanAt) })
        .from(termRescans)
        .where(
          inArray(
            termRescans.termId,
            current.map((c) => c.termId),
          ),
        );
      const oldest = await Promise.all(
        current.map(async (c) => {
          const [row] = await db
            .select({ at: min(syncCoverage.verifiedAt) })
            .from(syncCoverage)
            .where(
              and(
                eq(syncCoverage.studentId, c.studentId),
                gte(syncCoverage.weekStart, sql`${c.start}::date - 6`),
                lte(syncCoverage.weekStart, c.end),
              ),
            );
          return row?.at ?? null;
        }),
      );
      const known = oldest.filter((d): d is Date => !!d).sort((a, b) => +a - +b);
      rescan = { lastFullAt: done[0]?.at ?? null, oldestVerifiedAt: known[0] ?? null };
    }
  }
  const drift = await db
    .select({
      id: apiDriftEvents.id,
      endpoint: apiDriftEvents.endpoint,
      kind: apiDriftEvents.kind,
      path: apiDriftEvents.path,
      firstSeenAt: apiDriftEvents.firstSeenAt,
      lastSeenAt: apiDriftEvents.lastSeenAt,
      count: apiDriftEvents.count,
    })
    .from(apiDriftEvents)
    .leftJoin(
      apiDriftAcks,
      and(eq(apiDriftAcks.driftEventId, apiDriftEvents.id), eq(apiDriftAcks.familyId, account.familyId)),
    )
    // what this family has hidden; another family's «Понятно» hides nothing here
    .where(and(eq(apiDriftEvents.providerId, account.providerId), isNull(apiDriftAcks.familyId)));
  return {
    window,
    windowStudentIds: today.children.filter((c) => c.window.window).map((c) => c.studentId),
    next,
    sets,
    maxRequestsPerRun: plan.maxRequestsPerRun,
    rescan,
    drift,
  };
}
