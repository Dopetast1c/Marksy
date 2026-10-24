// Time in the child's school, never the device's (owner, M5a): "today", "now", the last school day, week and period
// edges all follow the student's timezone from /api/auth/me. A phone abroad, or a parent in another country, sees the
// school's day. Plain dates ("2026-10-19") are calendar days and are formatted without any timezone shift.

const parts = (tz: string, at: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

/** Today's date in the school's timezone, "2026-10-19" */
export function todayIn(tz: string, at = new Date()): string {
  const p = parts(tz, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight in the school's timezone */
export function minutesIn(tz: string, at = new Date()): number {
  const p = parts(tz, at);
  return Number(p.hour) * 60 + Number(p.minute);
}

const plain = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** A calendar day in the interface language: "пн, 19 окт" */
export function formatDay(iso: string, locale: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...opts,
  }).format(plain(iso));
}

/** A range of calendar days: "12–18 окт" */
export function formatRange(from: string, to: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).formatRange(
    plain(from),
    plain(to),
  );
}

/** An instant as school time: "12:17" */
export function formatTime(at: string | Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    typeof at === 'string' ? new Date(at) : at,
  );
}

/** Whole days from one calendar day to another */
export const daysBetween = (from: string, to: string) =>
  Math.round((plain(to).getTime() - plain(from).getTime()) / 86_400_000);
