// «Сейчас» (docs/design.md 4, 5.2): where the child is in their school day, from their own lessons of today (start and
// end times from the diary or their bells). Data only: the app says «3-й урок, до 10:40», «перемена, дальше 4-й в
// 10:55», «первый урок в 08:30», «уроки закончились в 13:35». A day with no lessons with times has no line.

export type NowLine =
  | { state: 'before'; slot: number | null; at: string }
  | { state: 'lesson'; slot: number | null; subjectName: string; until: string }
  | { state: 'break'; slot: number | null; subjectName: string; at: string }
  | { state: 'done'; at: string };

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};

export function nowLine(
  lessons: readonly {
    slot: number | null;
    start: string | null;
    end: string | null;
    subjectName: string;
    cancelled: boolean;
  }[],
  nowMinutes: number,
): NowLine | null {
  const timed = lessons
    .filter((l) => l.start && l.end && !l.cancelled)
    .sort((a, b) => minutes(a.start!) - minutes(b.start!));
  if (!timed.length) return null;
  const first = timed[0]!;
  if (nowMinutes < minutes(first.start!)) return { state: 'before', slot: first.slot, at: first.start! };
  for (const [i, l] of timed.entries()) {
    if (nowMinutes < minutes(l.end!))
      return nowMinutes >= minutes(l.start!)
        ? { state: 'lesson', slot: l.slot, subjectName: l.subjectName, until: l.end! }
        : { state: 'break', slot: l.slot, subjectName: l.subjectName, at: l.start! };
    const next = timed[i + 1];
    if (next && nowMinutes < minutes(next.start!))
      return { state: 'break', slot: next.slot, subjectName: next.subjectName, at: next.start! };
  }
  return { state: 'done', at: timed.at(-1)!.end! };
}
