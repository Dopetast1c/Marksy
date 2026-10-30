import type { ISODate } from '../model/schemas';

// Short calendar dates, one formatter for every screen (and later the notifications): "15 Oct", "Thu, 15 Oct",
// "12–18 Oct", "28 Sep – 4 Oct" (design.md 5, the prototype). Intl's short months carry a dot in some languages
// (Russian "Oct.") that the design does not use, so a language may give its own twelve short month names (packages/i18n,
// date.monthShort.1…12); a language without them gets Intl's. Dates are school-local calendar days: no time zone.

export interface ShortDateStyle {
  /** BCP 47 tag for Intl (weekday names, the fallback months) */
  locale: string;
  /** Twelve short month names, January first; null: Intl's */
  months: readonly string[] | null;
}

const at = (d: ISODate) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
const day = (d: ISODate) => Number(d.slice(8, 10));
const month = (d: ISODate) => Number(d.slice(5, 7)) - 1;

function monthOf(d: ISODate, s: ShortDateStyle): string {
  return s.months?.[month(d)] ?? new Intl.DateTimeFormat(s.locale, { timeZone: 'UTC', month: 'short' }).format(at(d));
}

const weekday = (d: ISODate, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(at(d));

/** "15 Oct", with the weekday "Thu, 15 Oct" */
export function shortDate(d: ISODate, s: ShortDateStyle, opts: { weekday?: boolean } = {}): string {
  const text = s.months
    ? `${day(d)} ${monthOf(d, s)}`
    : new Intl.DateTimeFormat(s.locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(at(d));
  return opts.weekday ? `${weekday(d, s.locale)}, ${text}` : text;
}

/** "12–18 Oct", "28 Sep – 4 Oct"; one day is that day */
export function shortRange(from: ISODate, to: ISODate, s: ShortDateStyle): string {
  if (from.slice(0, 10) === to.slice(0, 10)) return shortDate(from, s);
  if (!s.months)
    return new Intl.DateTimeFormat(s.locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).formatRange(
      at(from),
      at(to),
    );
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day(from)}–${day(to)} ${monthOf(to, s)}`;
  return `${shortDate(from, s)} – ${shortDate(to, s)}`;
}
