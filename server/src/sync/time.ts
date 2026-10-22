import { weekdayOf } from '@marksy/core';
import type { ISODate } from '@marksy/core';

// Wall-clock time in the school's time zone (the provider manifest's), computed once per decision. Everything after
// this works on plain local days and minutes, so DST and the server's own zone never move a lesson or a window.

export interface LocalTime {
  date: ISODate;
  /** Minutes since local midnight */
  minutes: number;
  /** 0 = Sunday, the convention of manifest.calendar */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function localTime(at: Date, timeZone: string): LocalTime {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: weekdayOf(date) };
}

/** The moment a local date and time names in a time zone (the offset is taken at that moment, so DST is right) */
export function fromLocal(date: ISODate, minutes: number, timeZone: string): Date {
  const guess =
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + minutes * 60_000;
  const seen = localTime(new Date(guess), timeZone);
  const seenMs =
    Date.UTC(Number(seen.date.slice(0, 4)), Number(seen.date.slice(5, 7)) - 1, Number(seen.date.slice(8, 10))) +
    seen.minutes * 60_000;
  return new Date(guess - (seenMs - guess));
}

/** "08:00-14:00" -> [480, 840] */
export function parseWindow(window: string): [number, number] {
  const [from, to] = window.split('-').map((t) => {
    const [h, m] = t.split(':').map(Number);
    return h! * 60 + m!;
  });
  return [from!, to!];
}
