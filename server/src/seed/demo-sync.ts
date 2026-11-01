import { addDays, weekStartOf } from '@marksy/core';
import { eq } from 'drizzle-orm';
import type { ISODate, ProviderManifest } from '@marksy/core';
import type { SeedCalendar, SeedStudent } from '@marksy/demo-diary';
import { apiDriftEvents, diaryAccounts, studentSources, syncCoverage, syncRuns, termRescans } from '../db/schema';
import type { SyncRunStats } from '../db/schema';
import { fromLocal, localTime } from '../sync/time';
import type { Tx } from '../sync/upsert';

// The demo family's diaries (docs/build-plan.md M5e): one fictional login per child's diary, as the prototype's
// Sync (sync.title) shows them ("a.petrov · Demo diary (full)" for Milena, "andrey.p · Demo diary (lite)" for Mark), with
// the last school days' runs (one of them failed, one manual try held back by the login interval), the weeks they
// verified, a finished re-scan and one drift notice. No credentials are stored: the scheduler takes only accounts
// that have them, and "Refresh now" (sync.refresh) says it is a demo, so nothing ever reads these diaries.

/** The prototype's login names (docs/mockups.html), fictional */
export const DEMO_DIARY_LABELS = { k: 'a.petrov', m: 'andrey.p' } as const;

/** The drift notice of the prototype: a field the demo diary started to send */
export const DEMO_DRIFT = { endpoint: 'lessons', kind: 'unknown_field', path: 'slots[].homework_deadline' } as const;

/**
 * When the scheduler "ran" on a school day: within each child's window, never at an exact minute, and not at the
 * same minutes for both diaries, so the family's run log reads as it would
 */
const RUN_MINUTES = {
  k: [8 * 60 + 13, 10 * 60 + 41, 12 * 60 + 17],
  m: [8 * 60 + 2, 10 * 60 + 26, 11 * 60 + 40],
} as const;
const MANUAL_MINUTE = 12 * 60 + 40;
const RUN_MS = 14_000;

export interface DemoDiaryChild {
  kid: SeedStudent;
  cal: SeedCalendar;
  manifest: ProviderManifest;
  studentId: string;
  termIds: Map<number, string>;
}

export async function insertDemoDiaries(
  tx: Tx,
  opts: { familyId: string; parentId: string; children: DemoDiaryChild[]; now: Date },
  count: (k: string, n: number) => void,
): Promise<void> {
  const { familyId, parentId, now } = opts;
  for (const { kid, cal, manifest, studentId, termIds } of opts.children) {
    const tz = manifest.timezone;
    const today = localTime(now, tz).date;
    const key = kid.key as keyof typeof DEMO_DIARY_LABELS;
    const [account] = await tx
      .insert(diaryAccounts)
      .values({
        familyId,
        providerId: manifest.id,
        role: 'parent',
        label: DEMO_DIARY_LABELS[key],
        externalUserId: `demo-user-${kid.key}`,
      })
      .returning();
    const accountId = account!.id;
    await tx.insert(studentSources).values({
      studentId,
      diaryAccountId: accountId,
      externalId: `demo-${kid.key}`,
      lastSeenAt: now,
      active: true,
    });

    // the last three school days of the child, oldest first
    const days = [...new Set(kid.lessons.map((l) => l.date).filter((d) => d <= today))].sort().slice(-3);
    type Run = typeof syncRuns.$inferInsert;
    const runs: Run[] = [];
    days.forEach((day, i) => {
      for (const minute of RUN_MINUTES[key]) {
        const startedAt = fromLocal(day, minute, tz);
        if (startedAt > now) continue;
        // the fuller diary's late-morning run on the middle day met a diary that did not answer
        const failed = key === 'k' && i === days.length - 2 && minute === RUN_MINUTES.k[1];
        const stats: SyncRunStats = failed ? {} : { weeks_verified: 3, lessons: 6, new: (minute + i) % 4 };
        runs.push({
          familyId,
          diaryAccountId: accountId,
          providerId: manifest.id,
          kind: 'scheduled',
          scope: { student_ids: [studentId] },
          trigger: 'schedule',
          startedAt,
          finishedAt: new Date(startedAt.getTime() + RUN_MS),
          status: failed ? 'failed' : 'success',
          errorClass: failed ? 'provider_unavailable' : null,
          error: failed ? 'ProviderUnavailableError: 503' : null,
          requests: failed ? 1 : 6,
          durationMs: RUN_MS,
          stats,
        });
      }
    });
    // a parent's "Refresh now" (sync.refresh) a little after Milena's last run, held back by the login interval
    const last = runs.at(-1);
    const manualAt = key === 'k' && last && fromLocal(localTime(last.startedAt, tz).date, MANUAL_MINUTE, tz);
    if (manualAt && manualAt < now && manualAt.getTime() - last.startedAt.getTime() < 60 * 60_000)
      runs.push({
        familyId,
        diaryAccountId: accountId,
        providerId: manifest.id,
        kind: 'manual',
        scope: {},
        trigger: `user:${parentId}`,
        startedAt: manualAt,
        finishedAt: manualAt,
        status: 'skipped_interval',
        durationMs: 0,
      });
    if (!runs.length) continue;
    const rows = await tx.insert(syncRuns).values(runs).returning();
    count('sync_runs', rows.length);
    const ok = rows.filter((r) => r.status === 'success');
    const lastOk = ok.at(-1);
    const lastLogin = rows.filter((r) => r.status !== 'skipped_interval').at(-1)!;
    await tx
      .update(diaryAccounts)
      .set({
        lastLoginAt: lastLogin.startedAt,
        lastAttemptAt: lastLogin.startedAt,
        lastOkAt: lastOk?.finishedAt ?? null,
        lastSuccessAt: lastOk?.finishedAt ?? null,
      })
      .where(eq(diaryAccounts.id, accountId));

    // the weeks of the current term the runs verified: the last fortnight today, older ones up to nine days ago, so
    // the plan has stale weeks to take and the re-scan line has an oldest week
    const term =
      cal.terms.find((t) => t.start <= today && today <= t.end) ?? cal.terms.filter((t) => t.end < today).at(-1);
    if (lastOk && term) {
      const weekStart = manifest.calendar.weekStart;
      const thisWeek = weekStartOf(today, weekStart);
      const weeks: ISODate[] = [];
      for (let w = weekStartOf(term.start, weekStart); w <= addDays(thisWeek, 7) && w <= term.end; w = addDays(w, 7))
        weeks.push(w);
      await tx.insert(syncCoverage).values(
        weeks.map((w, i) => {
          const age = w >= addDays(thisWeek, -7) ? 0 : 2 + ((weeks.length - i) % 8);
          return {
            studentId,
            weekStart: w,
            verifiedAt: new Date(lastOk.finishedAt!.getTime() - age * 86_400_000),
            runId: lastOk.id,
            status: 'verified' as const,
          };
        }),
      );
      count('sync_coverage', weeks.length);
      const termId = termIds.get(term.index);
      if (termId)
        await tx
          .insert(termRescans)
          .values({ termId, studentId, lastFullRescanAt: new Date(now.getTime() - 16 * 86_400_000) });
    }

    // the drift notice: the fuller demo diary started to send a field nobody knows yet
    if (key === 'k' && lastOk && ok.length > 1) {
      const first = ok.at(-2)!;
      await tx
        .insert(apiDriftEvents)
        .values({
          ...DEMO_DRIFT,
          providerId: manifest.id,
          syncRunId: lastOk.id,
          sample: null,
          firstSeenAt: first.startedAt,
          lastSeenAt: lastOk.startedAt,
          count: 2,
        })
        .onConflictDoUpdate({
          target: [apiDriftEvents.providerId, apiDriftEvents.endpoint, apiDriftEvents.kind, apiDriftEvents.path],
          set: { syncRunId: lastOk.id, firstSeenAt: first.startedAt, lastSeenAt: lastOk.startedAt, count: 2 },
        });
      count('api_drift_events', 1);
    }
  }
}
