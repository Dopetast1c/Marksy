import { sql } from 'drizzle-orm';
import type { Db } from './db/client';

// Retention of operational data (docs/design.md 10.4, "Retention"). Marks and mark_history are kept for the student's
// lifetime in the family; everything else here grows with time and is trimmed once a day. Every limit has a RETENTION_*
// override in .env.example. Deleting a family, an account or a student cascades at once and does not wait for this; a
// child goes with the last family that follows them (the trigger of migration 0004).

export interface RetentionLimits {
  /** sync_runs; older runs are compacted into sync_daily */
  syncRunsDays: number;
  /** raw_responses, except the last good body per week of the current term */
  rawResponsesDays: number;
  /** mark_events, lesson_prep_events and the notifications inbox */
  eventsDays: number;
  /** study_session_events */
  studyEventsDays: number;
  /** acknowledged api_drift_events that stopped occurring */
  driftAckedDays: number;
  /** lesson_tag_hits after their due date */
  tagHitsDays: number;
  /** sync_coverage, study_sessions, lesson_overrides: the current school year and this many before it */
  previousSchoolYears: number;
}

export const RETENTION_DEFAULTS: RetentionLimits = {
  syncRunsDays: 90,
  rawResponsesDays: 14,
  eventsDays: 180,
  studyEventsDays: 180,
  driftAckedDays: 180,
  tagHitsDays: 30,
  previousSchoolYears: 1,
};

const ENV: Record<keyof RetentionLimits, string> = {
  syncRunsDays: 'RETENTION_SYNC_RUNS_DAYS',
  rawResponsesDays: 'RETENTION_RAW_RESPONSES_DAYS',
  eventsDays: 'RETENTION_MARK_EVENTS_DAYS',
  studyEventsDays: 'RETENTION_STUDY_EVENTS_DAYS',
  driftAckedDays: 'RETENTION_DRIFT_ACKED_DAYS',
  tagHitsDays: 'RETENTION_TAG_HITS_DAYS',
  previousSchoolYears: 'RETENTION_PREVIOUS_SCHOOL_YEARS',
};

export function readRetention(env: Record<string, string | undefined> = process.env): RetentionLimits {
  const out = { ...RETENTION_DEFAULTS };
  for (const key of Object.keys(ENV) as (keyof RetentionLimits)[]) {
    const v = env[ENV[key]]?.trim();
    if (!v) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${ENV[key]} must be a whole number of days`);
    out[key] = n;
  }
  return out;
}

export type RetentionReport = Record<string, number>;

/** Applies every limit once; safe to run again. Returns the rows touched per table. */
export async function applyRetention(db: Db, limits: RetentionLimits, now = new Date()): Promise<RetentionReport> {
  const report: RetentionReport = {};
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const run = async (name: string, q: ReturnType<typeof sql>) => {
    const res = await db.execute(q);
    report[name] = res.rowCount ?? 0;
  };

  await db.transaction(async (tx) => {
    const cutoff = days(limits.syncRunsDays);
    // one line per account and day keeps "how often did this break" after the runs are gone
    await tx.execute(sql`
      insert into sync_daily (diary_account_id, date, runs, failures, requests)
      select diary_account_id, (started_at at time zone 'UTC')::date, count(*),
             count(*) filter (where status in ('failed', 'partial')), coalesce(sum(requests), 0)
      from sync_runs where started_at < ${cutoff}
      group by 1, 2
      on conflict (diary_account_id, date) do update set
        runs = sync_daily.runs + excluded.runs,
        failures = sync_daily.failures + excluded.failures,
        requests = sync_daily.requests + excluded.requests`);
    const res = await tx.execute(sql`delete from sync_runs where started_at < ${cutoff}`);
    report.sync_runs = res.rowCount ?? 0;
  });

  // the body that verified a week of the current term stays, so a drift fix can re-parse it without a new request
  await run(
    'raw_responses',
    sql`delete from raw_responses r where r.fetched_at < ${days(limits.rawResponsesDays)} and not exists (
      select 1 from sync_coverage c
      join school_years y on y.student_id = c.student_id
      join terms t on t.school_year_id = y.id
      where c.student_id = r.student_id and c.week_start = r.week_start and c.run_id = r.sync_run_id
        and t.start_date <= ${now}::date and t.end_date >= ${now}::date
        and r.week_start between t.start_date - 6 and t.end_date)`,
  );
  const events = days(limits.eventsDays);
  await run('mark_events', sql`delete from mark_events where created_at < ${events}`);
  await run('lesson_prep_events', sql`delete from lesson_prep_events where at < ${events}`);
  await run('notifications', sql`delete from notifications where created_at < ${events}`);
  await run('study_session_events', sql`delete from study_session_events where at < ${days(limits.studyEventsDays)}`);
  const drift = days(limits.driftAckedDays);
  await run(
    'api_drift_events',
    sql`delete from api_drift_events where acknowledged_at < ${drift} and last_seen_at < ${drift}`,
  );
  await run('lesson_tag_hits', sql`delete from lesson_tag_hits where due_date < ${days(limits.tagHitsDays)}::date`);
  await run('sessions', sql`delete from sessions where expires_at < ${now}`);
  // the login guard looks back a day at most; kept as long as the sync runs for diagnosis
  await run('cli_logins', sql`delete from cli_logins where at < ${days(limits.syncRunsDays)}`);
  // single-use secrets: an expired code is useless and should not linger
  await run('invites', sql`delete from invites where expires_at < ${now}`);
  await run('telegram_link_codes', sql`delete from telegram_link_codes where expires_at < ${now}`);
  // a decided request to join is history after the events' time; a pending one waits for the admin
  await run('join_requests', sql`delete from join_requests where status <> 'pending' and created_at < ${events}`);

  // per student: the start of the oldest school year still kept (null while the student has fewer years)
  const keptFrom = (student: ReturnType<typeof sql>) => sql`(
    select y.start_date from school_years y where y.student_id = ${student}
    order by y.start_date desc offset ${limits.previousSchoolYears} limit 1)`;
  await run('sync_coverage', sql`delete from sync_coverage c where c.week_start < ${keptFrom(sql`c.student_id`)}`);
  await run(
    'study_sessions',
    sql`delete from study_sessions s where s.started_at::date < ${keptFrom(sql`s.student_id`)}`,
  );
  await run(
    'lesson_overrides',
    sql`delete from lesson_overrides o using lessons l
        where l.id = o.lesson_id and l.date < ${keptFrom(sql`o.student_id`)}`,
  );

  // a family that set families.settings.retention_years keeps diary data that long (docs/design.md 14.1): every table
  // with a day of its own, and finals by the end of their school year. A child followed by several families keeps the
  // shortest limit any of them set (10.4)
  const shortest = sql`(select fs.student_id, min((f.settings->>'retention_years')::int) as years
      from family_students fs join families f on f.id = fs.family_id
      where (f.settings->>'retention_years') is not null group by fs.student_id) r`;
  const cutoff = sql`(${now}::date - make_interval(years => r.years))`;
  const dated = {
    marks: sql`x.date`,
    attendance: sql`x.date`,
    behaviour_events: sql`x.date`,
    homework_items: sql`coalesce(x.due_date, x.set_date)`,
    lessons: sql`x.date`,
  };
  for (const [table, day] of Object.entries(dated)) {
    await run(
      `${table}_family_limit`,
      sql`delete from ${sql.identifier(table)} x using ${shortest} where r.student_id = x.student_id and ${day} < ${cutoff}`,
    );
  }
  for (const table of ['final_marks', 'final_marks_raw']) {
    await run(
      `${table}_family_limit`,
      sql`delete from ${sql.identifier(table)} x using ${shortest}, school_years y
          where r.student_id = x.student_id and y.id = x.school_year_id and y.end_date < ${cutoff}`,
    );
  }
  return report;
}

/** Runs the janitor once per day: the scheduler calls this after every tick. */
export function dailyJanitor(db: Db, limits: RetentionLimits, onReport?: (r: RetentionReport) => void) {
  let lastDay = '';
  return async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today === lastDay) return;
    lastDay = today;
    onReport?.(await applyRetention(db, limits));
  };
}
