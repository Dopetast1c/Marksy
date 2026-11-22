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
import { driftVisibleTo, shownEndpoint } from './drift-scope';
import { closesOn, termState, termWeeks } from './plan';
import { finalsInOf, storedPlanCalendar } from './state';
import { fromLocal } from './time';

// Sync (sync.title; docs/design.md 5.6, 10.4): what the state card of one diary account says beyond its last run, from
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
    /** nextSchoolDay: the day, when known (at is its window's opening when that is known too) */
    date: z.string().nullable(),
    /** nextSchoolDay: holidays come first ("next after the holidays, Mon, 9 Nov", more.sync.nextAfterHolidays) */
    afterHolidays: z.boolean(),
  }),
  /** weeks waiting per set (standing, gap, rescan, post_term, backfill), all children together */
  sets: z.record(z.string(), z.number()),
  maxRequestsPerRun: z.number(),
  /** the current term's re-scan: the last time every week was checked, the oldest check of a week */
  rescan: z.object({ lastFullAt: z.date().nullable(), oldestVerifiedAt: z.date().nullable() }),
  /**
   * Per child the account reads: the terms that have started, with their state (D61: current, waiting for finals until
   * closesOn, closed), and what "Check the history again" (sync.rescan.button) would read again: school weeks so far and
   * requests, for a term and for the year
   */
  terms: z.array(
    z.object({
      studentId: z.string(),
      yearWeeks: z.number(),
      yearRequests: z.number(),
      terms: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          index: z.number(),
          start: z.string(),
          end: z.string(),
          state: z.enum(['current', 'waiting', 'closed']),
          closesOn: z.string().nullable(),
          weeks: z.number(),
          requests: z.number(),
        }),
      ),
    }),
  ),
  /** About how many of a re-check's requests one run takes, after its own (login, calendars, standing weeks) */
  rescanPerRun: z.number(),
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
  type Next = z.infer<typeof syncPlanOut>['next'];
  const mk = (kind: Next['kind'], at: Date | null = null): Next => ({ kind, at, date: null, afterHolidays: false });
  let next: Next;
  if (decision.start) next = mk('now');
  else
    switch (decision.reason) {
      case 'interval':
        next = mk('at', decision.retryAt ?? null);
        break;
      case 'paused':
        next = mk('paused', decision.retryAt ?? null);
        break;
      case 'requires_action':
        next = mk('action');
        break;
      case 'offline_retry':
        next = mk('offline');
        break;
      case 'jitter':
        next = mk('soon');
        break;
      default: {
        // outside the window: today's opens later, or the next school day's
        // a child's next read today (its day rate), not only the start of the school day
        const later = today.due.find((w) => w[0] > local.minutes);
        const day = plan.nextSchoolDay;
        next = later
          ? mk('at', fromLocal(local.date, later[0], manifest.timezone))
          : {
              kind: 'nextSchoolDay',
              at: day && day.from != null ? fromLocal(day.date, day.from, manifest.timezone) : null,
              date: day?.date ?? null,
              afterHolidays: day?.afterHolidays ?? false,
            };
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
  const termsOut: z.infer<typeof syncPlanOut>['terms'] = [];
  // what one week costs: one request, six for a provider that answers per day; a provider per term reads a term at once
  const unit = manifest.limits.fetchUnit;
  const cost = (weeks: number, spans = 1) => (unit === 'term' ? spans : unit === 'day' ? weeks * 6 : weeks);
  for (const studentId of kids) {
    const cal = await storedPlanCalendar(db, studentId, plan.ctx.today);
    if (!cal) continue;
    const finalsIn = await finalsInOf(db, studentId, cal);
    const rows = cal.terms.length
      ? await db
          .select({ id: terms.id, kind: terms.kind, index: terms.index })
          .from(terms)
          .where(
            inArray(
              terms.id,
              cal.terms.map((t) => t.id),
            ),
          )
      : [];
    const yearWeeks = termWeeks(cal, { id: '', start: cal.year.from, end: cal.year.to }, plan.ctx).length;
    const list = [...cal.terms]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((t) => ({ t, state: termState(t, plan.ctx.today, finalsIn), row: rows.find((r) => r.id === t.id) }))
      .filter((x): x is typeof x & { state: 'current' | 'waiting' | 'closed' } => x.state !== 'upcoming' && !!x.row)
      .map(({ t, state, row }) => {
        const weeks = termWeeks(cal, t, plan.ctx).length;
        return {
          id: t.id,
          kind: row!.kind,
          index: row!.index,
          start: t.start,
          end: t.end,
          state,
          closesOn: state === 'waiting' ? closesOn(t) : null,
          weeks,
          requests: cost(weeks),
        };
      });
    termsOut.push({ studentId, yearWeeks, yearRequests: cost(yearWeeks, list.length || 1), terms: list });
  }
  // a run's own requests before a re-check's weeks: the login and the account, then per child at most the three
  // standing weeks (the calendar and the school's reference data are read rarely, design.md 10.2)
  const rescanPerRun = Math.max(1, plan.maxRequestsPerRun - 2 - kids.length * 3);

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
    // what this family has hidden; another family's "Got it" (sync.drift.ack) hides nothing here
    .where(and(eq(apiDriftEvents.providerId, account.providerId), isNull(apiDriftAcks.familyId)));
  return {
    window,
    windowStudentIds: today.children.filter((c) => c.window.window).map((c) => c.studentId),
    next,
    sets,
    maxRequestsPerRun: plan.maxRequestsPerRun,
    rescan,
    terms: termsOut,
    rescanPerRun,
    // a hold of another account's week is that family's, not an API change (drift-scope.ts)
    drift: drift
      .filter((d) => driftVisibleTo(d.endpoint, account.id))
      .map((d) => ({ ...d, endpoint: shownEndpoint(d.endpoint) })),
  };
}
