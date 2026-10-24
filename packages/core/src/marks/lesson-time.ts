import type { ISODate } from '../model/schemas';

// When a lesson is over (docs/design.md 5.5): one rule for the server and the app, so the ⋯ menu, the «сейчас» tint
// and the server's refusal to tick a passed lesson never disagree. A lesson has passed once its end time (from the
// diary or the child's bells) is reached in the school's time zone; without an end time it counts as passed from the
// next day. Times are school-local "HH:MM", dates school-local days.

/** A moment as the school sees it: its calendar day and minutes since midnight */
export interface SchoolClock {
  date: ISODate;
  minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The school's day and time at an instant, whatever the device's or the server's zone */
export function schoolClock(at: Date, timeZone: string): SchoolClock {
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
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** "10:40" as minutes since midnight */
export function clockMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

/** Has the lesson ended at this instant in the school's time zone? */
export function lessonPassed(lesson: { date: ISODate; end: string | null }, at: Date, timeZone: string): boolean {
  const now = schoolClock(at, timeZone);
  if (lesson.date !== now.date) return lesson.date < now.date;
  return lesson.end != null && now.minutes >= clockMinutes(lesson.end);
}

/** Is the lesson going on at this instant (the «сейчас» tint)? Needs both times. */
export function lessonNow(
  lesson: { date: ISODate; start: string | null; end: string | null },
  at: Date,
  timeZone: string,
): boolean {
  if (!lesson.start || !lesson.end) return false;
  const now = schoolClock(at, timeZone);
  return lesson.date === now.date && now.minutes >= clockMinutes(lesson.start) && !lessonPassed(lesson, at, timeZone);
}
