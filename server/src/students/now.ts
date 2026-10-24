// «Сейчас» (docs/design.md 4, 5.2): where the child is in their school day, from their own lessons of today (start and
// end times from the diary or their bells). Data only: the app says «3-й урок, до 10:40», «перемена, дальше 4-й в
// 10:55», «первый урок в 08:30», «уроки закончились в 13:35»; the card on Главная also names the subject and the room,
// and after lessons the next school day's first lesson («завтра к 08:00»). A day with no lessons with times has no
// line, and so has any moment outside the school day: from an hour before the first lesson to two hours after the last
// (ux-principles D52, the same span as the sync window of D55).

/** The school day around the lessons: an hour before the first, two hours after the last */
export const NOW_BEFORE_MIN = 60;
export const NOW_AFTER_MIN = 120;

export type NowLine =
  | { state: 'before'; slot: number | null; subjectName: string; room: string | null; at: string }
  | { state: 'lesson'; slot: number | null; subjectName: string; room: string | null; until: string }
  | { state: 'break'; slot: number | null; subjectName: string; room: string | null; at: string }
  /** next: the first lesson of the next school day, when its time is known */
  | { state: 'done'; at: string; next: { date: string; at: string } | null };

interface TimedLesson {
  slot: number | null;
  start: string | null;
  end: string | null;
  subjectName: string;
  room?: string | null;
  cancelled: boolean;
}

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};

export function nowLine(
  lessons: readonly TimedLesson[],
  nowMinutes: number,
  /** the lessons of the next school day, for «завтра к 08:00» */
  nextDay: { date: string; lessons: readonly TimedLesson[] } | null = null,
): NowLine | null {
  const timed = lessons
    .filter((l) => l.start && l.end && !l.cancelled)
    .sort((a, b) => minutes(a.start!) - minutes(b.start!));
  if (!timed.length) return null;
  const first = timed[0]!;
  const lastEnd = Math.max(...timed.map((l) => minutes(l.end!)));
  if (nowMinutes < minutes(first.start!) - NOW_BEFORE_MIN || nowMinutes >= lastEnd + NOW_AFTER_MIN) return null;
  const at = (l: TimedLesson) => ({ slot: l.slot, subjectName: l.subjectName, room: l.room ?? null });
  if (nowMinutes < minutes(first.start!)) return { state: 'before', ...at(first), at: first.start! };
  for (const [i, l] of timed.entries()) {
    if (nowMinutes < minutes(l.end!))
      return nowMinutes >= minutes(l.start!)
        ? { state: 'lesson', ...at(l), until: l.end! }
        : { state: 'break', ...at(l), at: l.start! };
    const next = timed[i + 1];
    if (next && nowMinutes < minutes(next.start!)) return { state: 'break', ...at(next), at: next.start! };
  }
  const tomorrowFirst = nextDay?.lessons
    .filter((l) => l.start && !l.cancelled)
    .sort((a, b) => minutes(a.start!) - minutes(b.start!))[0];
  return {
    state: 'done',
    at: timed.at(-1)!.end!,
    next: nextDay && tomorrowFirst ? { date: nextDay.date, at: tomorrowFirst.start! } : null,
  };
}
