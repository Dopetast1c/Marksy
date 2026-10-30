import { addDays, bandOf, compareSubjects, isLowMark, markBand, previousInstance } from '@marksy/core';
import type { ISODate } from '@marksy/core';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaryAccounts, markEvents, marks, studentSources, subjects } from '../db/schema';
import type { MarkDiff } from '../db/schema';
import type { ChildContext, ResolvedPeriod } from './context';
import { absencesIn, chipOf, factOf, marksIn, refOf, refOrNull, remarksIn, subjectsOf } from './data';

// Attention (screen.events; docs/design.md 5.2a): computed on read from what sync recorded, never stored. Facts only: what a row says
// is data (a mark, a subject, a date), the words come from the app's i18n. Rows about the past follow the selected
// instance; rows about the future (holidays ahead) appear only in the current one. Ranked by severity, then date.

export type EventSeverity = 'critical' | 'low' | 'neutral' | 'good';
const ORDER: readonly EventSeverity[] = ['critical', 'low', 'neutral', 'good'];

export interface ChildEvent {
  kind:
    | 'low_mark'
    | 'mark_changed'
    | 'mark_removed'
    | 'absence'
    | 'average_down'
    | 'average_up'
    | 'teacher_comment'
    | 'holidays_ahead'
    | 'account_action';
  severity: EventSeverity;
  date: ISODate;
  subject: { id: string; name: string; color: string | null } | null;
  /** The facts the row shows; the app words them */
  facts: Record<string, unknown>;
  /** Where a tap goes */
  link: {
    screen: 'subject' | 'schedule' | 'school' | 'sync';
    subjectId?: string;
    lessonId?: string | null;
    date?: ISODate;
  };
}

/** A teacher's comment is a fact for 7 days (design.md 5.2a, D56) */
const COMMENT_DAYS = 7;
const HOLIDAYS_AHEAD_DAYS = 7;

export async function childEvents(db: Db, ctx: ChildContext, p: ResolvedPeriod): Promise<ChildEvent[]> {
  const range = { from: p.from, to: p.to };
  const out: ChildEvent[] = [];
  const subj = (id: string | null, name: string | null) => refOrNull(ctx, id, name);

  if (ctx.scale && ctx.rules) {
    const scale = ctx.scale;
    const rules = ctx.rules;
    const inRange = await marksIn(db, ctx.student.id, range);
    for (const m of inRange) {
      const low = m.values.some((v) => isLowMark(scale, v, rules));
      if (!low) continue;
      out.push({
        kind: 'low_mark',
        severity: markBand(scale, m.values) === 'critical' ? 'critical' : 'low',
        date: m.date,
        subject: subj(m.subjectId, m.subjectName),
        facts: { mark: chipOf(scale, m), workType: m.workType, topic: m.topic, comment: m.comment },
        link: { screen: 'subject', subjectId: m.subjectId },
      });
    }
    // an average that moved against the previous instance by the family's step, on enough marks (6.1, 6.4)
    if (p.instance) {
      const all = await marksIn(db, ctx.student.id);
      const subjectRows = await subjectsOf(db, ctx);
      const before = previousInstance(ctx.period, p.instance);
      const rows = compareSubjects(
        scale,
        all.map(factOf),
        subjectRows.map((s) => s.id),
        range,
        before ? { from: before.from, to: before.to } : null,
      );
      // at most three drops, the biggest first, and the one biggest rise, so the list is not only bad news (6.1)
      const moved = rows
        .filter((r) => r.delta != null && (r.trend === 'up' || r.trend === 'down'))
        .filter((r) => Math.abs(r.delta!) >= rules.dropStep && r.count >= rules.dropMinMarks)
        .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
      const shown = [
        ...moved.filter((r) => r.trend === 'down').slice(0, 3),
        ...moved.filter((r) => r.trend === 'up').slice(0, 1),
      ];
      for (const r of shown) {
        const s = subjectRows.find((x) => x.id === r.subjectId)!;
        out.push({
          kind: r.trend === 'down' ? 'average_down' : 'average_up',
          // a drop into the lowest band is critical, any other drop low
          severity: r.trend === 'down' ? (bandOf(scale, r.average) === 'critical' ? 'critical' : 'low') : 'good',
          date: p.to,
          subject: refOf(ctx, s.id, s.name),
          facts: { average: r.average, prevAverage: r.prevAverage, delta: r.delta, count: r.count },
          link: { screen: 'subject', subjectId: s.id },
        });
      }
    }
  }

  // a mark the teacher changed or removed (mark_events), by the day the change was seen
  const changes = await db
    .select({
      kind: markEvents.kind,
      diff: markEvents.diff,
      createdAt: markEvents.createdAt,
      markId: marks.id,
      date: marks.date,
      raw: marks.raw,
      values: marks.values,
      markKind: marks.kind,
      subjectId: marks.subjectId,
      subjectName: subjects.name,
    })
    .from(markEvents)
    .innerJoin(marks, eq(marks.id, markEvents.markId))
    .innerJoin(subjects, eq(subjects.id, marks.subjectId))
    .where(and(eq(markEvents.studentId, ctx.student.id), gte(marks.date, range.from), lte(marks.date, range.to)))
    .orderBy(desc(markEvents.createdAt));
  for (const c of changes) {
    if (c.kind !== 'changed' && c.kind !== 'removed') continue;
    const diff = (c.diff ?? {}) as MarkDiff;
    out.push({
      kind: c.kind === 'changed' ? 'mark_changed' : 'mark_removed',
      severity: 'neutral',
      date: c.date,
      subject: refOf(ctx, c.subjectId, c.subjectName),
      facts: {
        mark: chipOf(ctx.scale, { id: c.markId, values: c.values, raw: c.raw, kind: c.markKind }),
        before: diff.raw?.[0] ?? null,
        seenAt: c.createdAt,
      },
      link: { screen: 'subject', subjectId: c.subjectId },
    });
  }

  for (const a of await absencesIn(db, ctx, range)) {
    out.push({
      kind: 'absence',
      severity: 'low',
      date: a.date,
      subject: subj(a.subjectId, a.subjectName),
      facts: { status: a.status, excused: a.excused, code: a.code },
      link: { screen: 'schedule', lessonId: a.lessonId, date: a.date },
    });
  }

  // the teacher's comment without a mark (D56): a neutral fact for 7 days, no advice, no severity of its own
  const recent = { from: addDays(ctx.today, -(COMMENT_DAYS - 1)), to: ctx.today };
  for (const r of await remarksIn(db, ctx, range)) {
    if (r.date < recent.from || r.date > recent.to) continue;
    out.push({
      kind: 'teacher_comment',
      severity: 'neutral',
      date: r.date,
      subject: subj(r.subjectId, r.subjectName),
      facts: { text: r.text, slot: r.slot },
      link: { screen: 'schedule', lessonId: r.lessonId, date: r.date },
    });
  }

  // the diary account that reads the child needs a new password or a code: for the admin and parents of the family
  // that owns it (5.2a); the diary refused the login, nothing is read until someone acts
  if (ctx.role !== 'student' && (!p.instance || p.instance.offset === 0)) {
    const [source] = await db
      .select({ requiresAction: diaryAccounts.requiresAction, accountId: diaryAccounts.id })
      .from(studentSources)
      .innerJoin(diaryAccounts, eq(diaryAccounts.id, studentSources.diaryAccountId))
      .where(
        and(
          eq(studentSources.studentId, ctx.student.id),
          eq(studentSources.active, true),
          eq(diaryAccounts.familyId, ctx.familyId),
        ),
      );
    if (source?.requiresAction)
      out.push({
        kind: 'account_action',
        severity: 'critical',
        date: ctx.today,
        subject: null,
        facts: { action: source.requiresAction },
        link: { screen: 'sync' },
      });
  }

  // holidays within 7 days: a fact about the future, only in the current instance (5.2a)
  if (!p.instance || p.instance.offset === 0) {
    const next = ctx.holidayRows.find((h) => h.start > ctx.today && h.start <= addDays(ctx.today, HOLIDAYS_AHEAD_DAYS));
    if (next)
      out.push({
        kind: 'holidays_ahead',
        severity: 'neutral',
        date: next.start,
        subject: null,
        facts: { start: next.start, end: next.end, note: next.note, kind: next.kind },
        link: { screen: 'school' },
      });
  }

  return out.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || b.date.localeCompare(a.date));
}
