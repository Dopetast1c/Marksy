import { describe, expect, it } from 'vitest';
import { boundWindows, childWindow, formatWindow, unionWindows } from './window';
import type { ChildDay } from './window';

// Two fictional children of one family (prototype SCHOOL): Milena in the first shift, six lessons; Mark in grade 1
// with his own bells. Times in local minutes.

const FIRST_SHIFT = [
  { slot: 1, start: '08:00', end: '08:45' },
  { slot: 2, start: '08:55', end: '09:40' },
  { slot: 3, start: '09:55', end: '10:40' },
  { slot: 4, start: '10:55', end: '11:40' },
  { slot: 5, start: '11:55', end: '12:40' },
  { slot: 6, start: '12:50', end: '13:35' },
];
const GRADE_1 = [
  { slot: 1, start: '08:30', end: '09:05' },
  { slot: 2, start: '09:20', end: '09:55' },
  { slot: 3, start: '10:15', end: '10:50' },
  { slot: 4, start: '11:10', end: '11:45' },
];
const STAND_IN: [number, number] = [480, 840];
const day = (over: Partial<ChildDay>): ChildDay => ({
  schoolDay: true,
  fetched: true,
  lessons: [],
  template: [],
  bells: [],
  ...over,
});
const lessons = (n: number) => Array.from({ length: n }, (_, i) => ({ slot: i + 1, start: null }));

describe("a child's school day as the sync window", () => {
  it('an hour before the first lesson to two hours after the last, from the bells', () => {
    const milena = childWindow(day({ lessons: lessons(6), bells: FIRST_SHIFT }), STAND_IN);
    expect(milena).toEqual({ window: [7 * 60, 15 * 60 + 35], source: 'timetable' });
    expect(formatWindow(milena.window!)).toBe('07:00–15:35');
    const mark = childWindow(day({ lessons: lessons(4), bells: GRADE_1 }), STAND_IN);
    expect(formatWindow(mark.window!)).toBe('07:30–13:45');
  });

  it("two children: the account's window is the union; SYNC_WINDOW bounds it", () => {
    const a = childWindow(day({ lessons: lessons(6), bells: FIRST_SHIFT }), STAND_IN).window!;
    const b = childWindow(day({ lessons: lessons(4), bells: GRADE_1 }), STAND_IN).window!;
    expect(unionWindows([a, b]).map(formatWindow)).toEqual(['07:00–15:35']);
    // a second shift far apart stays two windows
    expect(
      unionWindows([
        [420, 600],
        [780, 1080],
      ]).map(formatWindow),
    ).toEqual(['07:00–10:00', '13:00–18:00']);
    expect(boundWindows([[420, 935]], [480, 840]).map(formatWindow)).toEqual(['08:00–14:00']);
  });

  it('holidays, weekends and family days off have no window', () => {
    expect(childWindow(day({ schoolDay: false, lessons: lessons(6), bells: FIRST_SHIFT }), STAND_IN)).toEqual({
      window: null,
      source: 'no_school',
    });
  });

  it('a fetched day without lessons has none; a day not fetched yet uses the regular week', () => {
    expect(childWindow(day({ lessons: [] }), STAND_IN)).toEqual({ window: null, source: 'no_lessons' });
    const ahead = childWindow(
      day({ fetched: false, template: [{ slot: 2 }, { slot: 5 }], bells: FIRST_SHIFT }),
      STAND_IN,
    );
    expect(formatWindow(ahead.window!)).toBe('07:55–14:40');
  });

  it('a day whose times are unknown falls back to the manifest', () => {
    // lessons without a start time and no bells
    expect(childWindow(day({ lessons: lessons(3) }), STAND_IN)).toEqual({ window: STAND_IN, source: 'manifest' });
    // nothing known at all yet
    expect(childWindow(day({ fetched: false }), STAND_IN)).toEqual({ window: STAND_IN, source: 'manifest' });
  });

  it("the diary's own start time wins; without bells a lesson lasts 45 minutes", () => {
    const w = childWindow(day({ lessons: [{ slot: 1, start: '08:30' }] }), STAND_IN);
    expect(formatWindow(w.window!)).toBe('07:30–11:15');
  });
});
