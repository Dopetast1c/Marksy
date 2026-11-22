import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db } from '../db/client';

// `marksy diag marks` (docs/running.md): what happened to the stored records, as counts only. Children are shown by
// the first eight characters of their id, runs by kind and trigger class, the diary's own words only where they are
// API words (period keys, endpoint patterns). Never a name, a mark, a comment or a teacher. Read-only: one transaction
// with default_transaction_read_only.

/** A key printed only when it is an API word (UPPER_SNAKE, like the probe's reportable()); anything else is "*" */
const apiWord = (key: SQL) => sql`case when ${key} ~ '^[A-Z][A-Z0-9_]{0,39}$' then ${key} else '*' end`;

interface Section {
  title: string;
  query: SQL;
}

const SECTIONS: Section[] = [
  {
    title: 'Marks per child and term (total, removed)',
    query: sql`select left(m.student_id::text, 8) as child, coalesce(t.kind || ' ' || t.index, '-') as term,
        count(*) as marks, count(m.removed_at) as removed
      from marks m
      left join school_years y on y.student_id = m.student_id and m.date between y.start_date and y.end_date
      left join terms t on t.school_year_id = y.id and m.date between t.start_date and t.end_date
      group by 1, 2 order by 1, 2`,
  },
  {
    title: 'Mark removals by day and by the run that made them (notified: sent to someone)',
    query: sql`select left(e.student_id::text, 8) as child, e.created_at::date as day, r.kind,
        split_part(r.trigger, ':', 1) as trigger, r.scope->'sets' as sets, count(*) as removed,
        count(e.notified_at) as notified
      from mark_events e
      left join lateral (select s.kind, s.trigger, s.scope from sync_runs s
        where s.started_at <= e.created_at and coalesce(s.finished_at, s.started_at + interval '1 hour') >= e.created_at
          and s.diary_account_id in (select ss.diary_account_id from student_sources ss where ss.student_id = e.student_id)
        order by s.started_at desc limit 1) r on true
      where e.kind = 'removed' group by 1, 2, 3, 4, 5 order by 2, 1`,
  },
  {
    title: 'Other records removed, by day',
    query: sql`select 'lessons' as records, left(student_id::text, 8) as child, removed_at::date as day, count(*)
        from lessons where removed_at is not null group by 1, 2, 3
      union all select 'attendance', left(student_id::text, 8), removed_at::date, count(*)
        from attendance where removed_at is not null group by 1, 2, 3
      union all select 'behaviour', left(student_id::text, 8), removed_at::date, count(*)
        from behaviour_events where removed_at is not null group by 1, 2, 3
      order by 1, 3, 2`,
  },
  {
    title: 'Final marks per child and term',
    query: sql`select left(f.student_id::text, 8) as child, coalesce(t.kind || ' ' || t.index, 'year') as term,
        f.source, count(*) as finals
      from final_marks f left join terms t on t.id = f.period_id group by 1, 2, 3 order by 1, 2`,
  },
  {
    title: 'Stored final-marks responses: shape, period keys and whether they name a term',
    query: sql`select left(x.student_id::text, 8) as child, x.fetched_at::date as fetched,
        case when jsonb_typeof(x.raw_json) = 'array' then 'mapped list (' || jsonb_array_length(x.raw_json) || ')'
             else 'response' end as kept,
        ${apiWord(sql`p.key`)} as period, p.n as cells,
        exists (select 1 from terms t join school_years y on y.id = t.school_year_id
          where y.student_id = x.student_id and (t.label = p.key or t.external_id = p.key)) as names_a_term
      from final_marks_raw x
      left join lateral (select k2.key, count(*) as n
        from jsonb_each(case when jsonb_typeof(x.raw_json -> 'body' -> 'marks') = 'object'
                             then x.raw_json -> 'body' -> 'marks' else '{}'::jsonb end) k1,
             jsonb_each(case when jsonb_typeof(k1.value) = 'object' then k1.value else '{}'::jsonb end) k2
        group by k2.key) p on true
      order by 1, 4`,
  },
  {
    title: 'Final-marks responses in raw_responses (the last 14 days): period keys',
    query: sql`select left(r.student_id::text, 8) as child, max(r.fetched_at)::date as last, ${apiWord(sql`k2.key`)} as period,
        count(*) as cells
      from raw_responses r,
        jsonb_each(case when jsonb_typeof(r.body -> 'marks') = 'object' then r.body -> 'marks' else '{}'::jsonb end) k1,
        jsonb_each(case when jsonb_typeof(k1.value) = 'object' then k1.value else '{}'::jsonb end) k2
      where r.week_start is null and r.status = 200
      group by 1, 3 order by 1, 3`,
  },
  {
    title: 'Kept week bodies per child and term (size in bytes: an empty week is small)',
    query: sql`select left(r.student_id::text, 8) as child, coalesce(t.kind || ' ' || t.index, '-') as term,
        count(distinct r.week_start) as weeks, count(*) as bodies, min(pg_column_size(r.body)) as smallest,
        max(pg_column_size(r.body)) as largest, sum(pg_column_size(r.body)) as total
      from raw_responses r
      left join school_years y on y.student_id = r.student_id and r.week_start between y.start_date - 6 and y.end_date
      left join terms t on t.school_year_id = y.id and r.week_start between t.start_date - 6 and t.end_date
      where r.week_start is not null group by 1, 2 order by 1, 2`,
  },
  {
    title: 'Weeks held by the mass-removal guard',
    query: sql`select left(student_id::text, 8) as child, week_start, status, held_at::date as held
      from sync_coverage where held_at is not null order by 1, 2`,
  },
  {
    title: 'Changes in the diary’s API since 30 October (kind and place only)',
    query: sql`select endpoint, kind, path, count, first_seen_at::date as first, last_seen_at::date as last
      from api_drift_events where last_seen_at >= '2026-10-30' order by last_seen_at desc`,
  },
  {
    title: 'Background jobs',
    query: sql`select id, status, done, total, attempts, finished_at::date as finished from background_jobs order by id`,
  },
];

/** A fixed-width table of rows; every value is a count, a date, an id prefix or an API word */
export function table(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '  (none)';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) =>
    v === null || v === undefined
      ? ''
      : v instanceof Date
        ? v.toISOString().slice(0, 10)
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals: string[]) => `  ${vals.map((v, i) => v.padEnd(width[i]!)).join('  ')}`.trimEnd();
  return [
    line(cols),
    line(width.map((w) => '-'.repeat(w))),
    ...rows.map((r) => line(cols.map((c) => cell(r[c])))),
  ].join('\n');
}

/** Prints every section of `diag marks`; read-only */
export async function diagMarks(db: Db, out: (line: string) => void): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    for (const s of SECTIONS) {
      const res = await tx.execute(s.query);
      out(s.title);
      out(table(res.rows as Record<string, unknown>[]));
      out('');
    }
  });
}
