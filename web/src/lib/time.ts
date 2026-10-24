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

// Calendar days ("12–18 окт", "чт, 15 окт") are written by core's shortDate and shortRange with i18n's dateStyle().

/** An instant as school time: "12:17" */
export function formatTime(at: string | Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    typeof at === 'string' ? new Date(at) : at,
  );
}
