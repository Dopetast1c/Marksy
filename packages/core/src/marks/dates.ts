import type { ISODate } from '../model/schemas';

// Calendar-day arithmetic on ISO dates. Dates are school-local days; the server converts "now" to the account's
// time zone once and everything below works on plain days, so no time zone or DST can shift a mark to another week.

const toUtc = (d: ISODate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtc(toUtc(d) + n * DAY);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

/** ISO weekday number, 0 = Sunday, the convention of manifest.calendar. */
export function weekdayOf(d: ISODate): number {
  return new Date(toUtc(d)).getUTCDay();
}

/** The first day of the week containing d, for a calendar whose week starts on weekStart. */
export function weekStartOf(d: ISODate, weekStart: number): ISODate {
  return addDays(d, -((weekdayOf(d) - weekStart + 7) % 7));
}

export function monthStartOf(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

/** The first day of the month `n` months after the month of d. */
export function addMonths(d: ISODate, n: number): ISODate {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1 + n;
  return fromUtc(Date.UTC(y, m, 1));
}

/** The last day of the month of d. */
export function monthEndOf(d: ISODate): ISODate {
  return addDays(addMonths(d, 1), -1);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Inclusive on both ends. */
export function inRange(d: ISODate, range: { from: ISODate; to: ISODate }): boolean {
  return d >= range.from && d <= range.to;
}
