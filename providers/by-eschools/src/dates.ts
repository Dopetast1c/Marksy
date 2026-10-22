import type { DateRange, ISODate } from '@marksy/core';

// e-schools timestamps are milliseconds at local midnight (docs/api-spec.md 6.5: 2026-08-31T21:00Z is 2026-09-01 in
// Minsk). They become calendar days in the manifest's time zone. End timestamps (end_date, end_ts) are read as the
// last day of the range, which is what the 2026/27 quarter table in api-spec 6.4 shows; the probe checks it on real
// weeks (a week of 6 or 7 days, not 8).

const formatters = new Map<string, Intl.DateTimeFormat>();

export function toISODate(ms: number, timeZone: string): ISODate {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f.format(new Date(ms));
}

export interface DatedRange {
  start: number;
  end: number;
}

/** The inclusive day range of a start/end timestamp pair. */
export function dayRange({ start, end }: DatedRange, timeZone: string): DateRange {
  return { from: toISODate(start, timeZone), to: toISODate(end, timeZone) };
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}
