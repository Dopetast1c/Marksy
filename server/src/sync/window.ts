import { parseWindow } from './time';

// A child's school day as the sync window (docs/design.md 10.2, ux-principles D55): from an hour before the first
// lesson to two hours after the last, from the child's own lessons or regular week and bells. No school, no window.
// When the day's lessons are known without times, or the day was not fetched yet, the manifest's window stands in.
// An account's window is the union of the windows of the children it reads; SYNC_WINDOW bounds every one of them.

export const BEFORE_FIRST_MIN = 60;
export const AFTER_LAST_MIN = 120;
/** A lesson's length when neither the diary nor the bells give its end */
export const LESSON_MIN = 45;

export type Window = [number, number];

export interface ChildDay {
  /** A school day for this child: a school weekday, inside the year, not the child's holidays or a family day off */
  schoolDay: boolean;
  /** The week of this date was fetched: its lessons below are the timetable, an empty list means no lessons */
  fetched: boolean;
  /** The child's lessons of the date, as stored */
  lessons: readonly { slot: number | null; start: string | null }[];
  /** The child's regular week for this weekday, used when the date's lessons are not known yet */
  template: readonly { slot: number; start?: string | null }[];
  /** The child's bells for this weekday */
  bells: readonly { slot: number; start: string; end: string }[];
}

export type ChildWindow =
  { window: Window; source: 'timetable' | 'manifest' } | { window: null; source: 'no_school' | 'no_lessons' };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

export function childWindow(day: ChildDay, standIn: Window | null): ChildWindow {
  if (!day.schoolDay) return { window: null, source: 'no_school' };
  const items = day.lessons.length ? day.lessons : day.fetched ? [] : day.template;
  if (items.length === 0) {
    // a fetched day without lessons has none; an unknown day without a regular week gets the manifest's window
    if (day.fetched || !standIn) return { window: null, source: 'no_lessons' };
    return { window: standIn, source: 'manifest' };
  }
  const bell = new Map(day.bells.map((b) => [b.slot, b]));
  const spans: Window[] = [];
  for (const it of items) {
    const b = it.slot != null ? bell.get(it.slot) : undefined;
    const start = it.start ?? b?.start;
    // a lesson without a time makes the day's span a guess: the manifest's window instead
    if (!start) return standIn ? { window: standIn, source: 'manifest' } : { window: null, source: 'no_lessons' };
    const from = minutes(start);
    spans.push([from, b ? minutes(b.end) : from + LESSON_MIN]);
  }
  const first = Math.min(...spans.map((s) => s[0]));
  const last = Math.max(...spans.map((s) => s[1]));
  return {
    window: [Math.max(0, first - BEFORE_FIRST_MIN), Math.min(24 * 60, last + AFTER_LAST_MIN)],
    source: 'timetable',
  };
}

/** Overlapping or touching windows merged, in order */
export function unionWindows(windows: readonly Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  const out: Window[] = [];
  for (const w of sorted) {
    const last = out.at(-1);
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else out.push([w[0], w[1]]);
  }
  return out;
}

/** Each window cut to the outer bound (SYNC_WINDOW); empty ones dropped */
export function boundWindows(windows: readonly Window[], bound: Window | null): Window[] {
  if (!bound) return [...windows];
  return windows.map((w): Window => [Math.max(w[0], bound[0]), Math.min(w[1], bound[1])]).filter((w) => w[0] < w[1]);
}

export const parseOptionalWindow = (w: string | undefined | null): Window | null => (w ? parseWindow(w) : null);

export const formatWindow = (w: Window) =>
  `${String(Math.floor(w[0] / 60)).padStart(2, '0')}:${String(w[0] % 60).padStart(2, '0')}–${String(Math.floor(w[1] / 60)).padStart(2, '0')}:${String(w[1] % 60).padStart(2, '0')}`;
