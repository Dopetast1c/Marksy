import type { DateRange, ISODate, Term } from '../model/schemas';
import { addDays, addMonths, maxDate, minDate, monthEndOf, monthStartOf, weekStartOf } from './dates';

// Calendar-aligned periods (docs/design.md 6): a kind plus an instance counted back from the current one. Marks see
// the current instance up to today; lessons see the whole of it (tomorrow's lessons belong to "this week").

export type PeriodKind = 'week' | 'month' | 'term' | 'year';
export const PERIOD_KINDS: readonly PeriodKind[] = ['week', 'month', 'term', 'year'];

/** What period maths needs to know about the student, resolved by the server in the account's time zone. */
export interface PeriodContext {
  /** Today, school-local */
  today: ISODate;
  /** manifest.calendar.weekStart */
  weekStart: number;
  /** The current school year */
  schoolYear: DateRange;
  /** Terms of the current school year, ordered; empty when the provider has none */
  terms: readonly Term[];
  /** Earlier school years Marksy has, newest first */
  pastYears?: readonly DateRange[];
}

export type PeriodUse = 'marks' | 'lessons';

export interface PeriodInstance extends DateRange {
  kind: PeriodKind;
  /** 0 = current, 1 = the one before, ... */
  offset: number;
  /** The end of the whole instance, also for the current one */
  end: ISODate;
  /** For kind term: the term */
  term?: Term;
}

/** The term in progress, or during holidays the last term that has started. */
function currentTermIndex(ctx: PeriodContext): number {
  let idx = -1;
  ctx.terms.forEach((t, i) => {
    if (t.start <= ctx.today) idx = i;
  });
  return idx;
}

/**
 * One instance of a period kind, or null when it does not exist: nothing before the school year start (Marksy's
 * earlier years only for kind year), nothing after the current instance, no terms on a provider without them.
 */
export function periodInstance(
  ctx: PeriodContext,
  kind: PeriodKind,
  offset: number,
  use: PeriodUse = 'marks',
): PeriodInstance | null {
  if (offset < 0 || !Number.isInteger(offset)) return null;
  const clip = (from: ISODate, end: ISODate, extra?: Partial<PeriodInstance>): PeriodInstance => ({
    kind,
    offset,
    from,
    end,
    // the current instance of marks ends today; a past one, or lessons, the whole instance
    to: offset === 0 && use === 'marks' ? minDate(end, ctx.today) : end,
    ...extra,
  });

  switch (kind) {
    case 'week': {
      const from = addDays(weekStartOf(ctx.today, ctx.weekStart), -7 * offset);
      const end = addDays(from, 6);
      return end < ctx.schoolYear.from ? null : clip(from, end);
    }
    case 'month': {
      const from = addMonths(monthStartOf(ctx.today), -offset);
      const end = monthEndOf(from);
      return end < ctx.schoolYear.from ? null : clip(from, end);
    }
    case 'term': {
      const term = ctx.terms[currentTermIndex(ctx) - offset];
      return term ? clip(term.start, term.end, { term }) : null;
    }
    case 'year': {
      if (offset === 0) return clip(ctx.schoolYear.from, ctx.schoolYear.to);
      const past = ctx.pastYears?.[offset - 1];
      return past ? clip(past.from, past.to) : null;
    }
  }
}

/** The instance a comparison is made against: always the one right before the selected one (design 6). */
export function previousInstance(ctx: PeriodContext, current: PeriodInstance, use: PeriodUse = 'marks') {
  return periodInstance(ctx, current.kind, current.offset + 1, use);
}

/** Every instance of a kind, current first, back to the edge: what the navigator's picker lists. */
export function listInstances(ctx: PeriodContext, kind: PeriodKind, use: PeriodUse = 'marks'): PeriodInstance[] {
  const out: PeriodInstance[] = [];
  for (let o = 0; ; o++) {
    const p = periodInstance(ctx, kind, o, use);
    if (!p) return out;
    out.push(p);
  }
}

/** Period kinds this student has: the term kind only when the provider has terms. */
export function availableKinds(ctx: Pick<PeriodContext, 'terms'>): PeriodKind[] {
  return PERIOD_KINDS.filter((k) => k !== 'term' || ctx.terms.length > 0);
}

export interface TrendBucket extends DateRange {
  /** Starts after today: drawn empty, never as a zero */
  future: boolean;
  /** The selected instance, highlighted and last among the past buckets */
  selected: boolean;
}

/**
 * The buckets of the Динамика chart for the selected instance (docs/design.md 5.2): the eight weeks up to it, the
 * months of the school year up to it, every term of the year, or the months of the year. Nothing before the year start.
 */
export function trendBuckets(ctx: PeriodContext, selected: PeriodInstance): TrendBucket[] {
  const cut = (from: ISODate, end: ISODate): TrendBucket => ({
    from,
    to: from <= ctx.today && end > ctx.today ? ctx.today : end,
    future: from > ctx.today,
    selected: selected.from >= from && selected.from <= end,
  });
  switch (selected.kind) {
    case 'week': {
      const out: TrendBucket[] = [];
      for (let i = 7; i >= 0; i--) {
        const from = addDays(selected.from, -7 * i);
        const end = addDays(from, 6);
        if (end >= ctx.schoolYear.from) out.push(cut(from, end));
      }
      return out;
    }
    case 'month': {
      const out: TrendBucket[] = [];
      for (let from = monthStartOf(ctx.schoolYear.from); from <= selected.from; from = addMonths(from, 1)) {
        out.push(cut(from, monthEndOf(from)));
      }
      return out;
    }
    case 'term':
      return ctx.terms.map((t) => cut(t.start, t.end));
    case 'year': {
      const out: TrendBucket[] = [];
      for (let from = monthStartOf(selected.from); from <= selected.end; from = addMonths(from, 1)) {
        out.push({ ...cut(maxDate(from, selected.from), minDate(monthEndOf(from), selected.end)), selected: false });
      }
      return out;
    }
  }
}
