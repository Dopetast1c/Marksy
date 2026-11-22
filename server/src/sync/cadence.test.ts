import { CADENCE_PRESETS } from '@marksy/core';
import type { SyncCadence } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { calendarDue, dueWindow, finalsDue, schoolDue } from './cadence';
import type { PlanCalendar } from './plan';
import { localTime } from './time';

const TZ = 'Europe/Minsk';
/** A moment given as school-local "YYYY-MM-DD HH:MM" (Minsk is UTC+3 all year) */
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:00`);
const ctx = (nowLocal: string) => {
  const now = at(nowLocal);
  return { now, today: localTime(now, TZ).date, localDate: (d: Date) => localTime(d, TZ).date };
};
const CAL: PlanCalendar = {
  year: { from: '2025-09-01', to: '2026-05-31' },
  terms: [
    { id: 'q1', start: '2025-09-01', end: '2025-10-25' },
    { id: 'q2', start: '2025-11-03', end: '2025-12-24' },
  ],
  holidays: [{ from: '2025-10-26', to: '2025-11-02' }],
};
const marks: SyncCadence = { ...CADENCE_PRESETS.marks };
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

describe('dueWindow', () => {
  const day: [number, number] = [hm('07:00'), hm('15:30')];

  it('hourly: from an hour after the last read today, a quarter of an hour early allowed', () => {
    expect(dueWindow(day, 'hourly', null)).toEqual(day);
    expect(dueWindow(day, 'hourly', hm('09:10'))).toEqual([hm('09:55'), hm('15:30')]);
    expect(dueWindow(day, 'hourly', hm('15:00'))).toBeNull();
  });

  it('every two hours', () => {
    expect(dueWindow(day, 'every2h', hm('09:10'))).toEqual([hm('10:55'), hm('15:30')]);
  });

  it('three times: once in each third of the school day', () => {
    // 07:00-15:30 is 510 minutes: thirds start at 07:00, 09:50 and 12:40
    expect(dueWindow(day, 'thrice', null)).toEqual(day);
    expect(dueWindow(day, 'thrice', hm('07:20'))).toEqual([hm('09:50'), hm('15:30')]);
    expect(dueWindow(day, 'thrice', hm('10:05'))).toEqual([hm('12:40'), hm('15:30')]);
    expect(dueWindow(day, 'thrice', hm('12:50'))).toBeNull();
  });

  it('after school: once, from the end of the last lesson (two hours before the window ends)', () => {
    expect(dueWindow(day, 'afterSchool', null)).toEqual([hm('13:30'), hm('15:30')]);
    // a read in the morning (the first run of the day) does not count for the one after the lessons
    expect(dueWindow(day, 'afterSchool', hm('08:00'))).toEqual([hm('13:30'), hm('15:30')]);
    expect(dueWindow(day, 'afterSchool', hm('13:40'))).toBeNull();
  });

  it('no school day, no window', () => {
    expect(dueWindow(null, 'hourly', null)).toBeNull();
  });
});

describe('the reference data', () => {
  it('the calendar: monthly, at once when a new school year begins, never by the clock with onChange', () => {
    expect(calendarDue(null, marks, CAL, ctx('2025-10-15 10:00'))).toBe(true);
    expect(calendarDue(at('2025-09-20 10:00'), marks, CAL, ctx('2025-10-15 10:00'))).toBe(false);
    expect(calendarDue(at('2025-09-10 10:00'), marks, CAL, ctx('2025-10-15 10:00'))).toBe(true);
    expect(calendarDue(at('2026-05-20 10:00'), marks, CAL, ctx('2026-09-01 08:00'))).toBe(true);
    const onChange = { ...marks, calendar: 'onChange' as const };
    expect(calendarDue(at('2025-09-01 10:00'), onChange, CAL, ctx('2026-03-01 10:00'))).toBe(false);
  });

  it('the school: monthly, at the start of a term and once more a week into it', () => {
    const onChange = { ...marks, school: 'onChange' as const };
    // read in the first term: the second has started since
    expect(schoolDue(at('2025-10-20 10:00'), onChange, CAL, ctx('2025-11-04 10:00'))).toBe(true);
    expect(schoolDue(at('2025-11-04 10:00'), onChange, CAL, ctx('2025-11-05 10:00'))).toBe(false);
    // a week into the term: once more (a timetable entered late)
    expect(schoolDue(at('2025-11-04 10:00'), onChange, CAL, ctx('2025-11-11 10:00'))).toBe(true);
    expect(schoolDue(at('2025-11-11 10:00'), onChange, CAL, ctx('2025-11-20 10:00'))).toBe(false);
    expect(schoolDue(at('2025-11-11 10:00'), marks, CAL, ctx('2025-12-12 10:00'))).toBe(true);
    expect(schoolDue(null, onChange, CAL, ctx('2025-11-20 10:00'))).toBe(true);
  });

  it('finals: daily from two weeks before the end of a term until it closes, weekly otherwise, never with off', () => {
    const none = new Set<string>();
    // the middle of the term: weekly
    expect(finalsDue(at('2025-09-25 10:00'), marks, CAL, none, ctx('2025-09-29 10:00'))).toBe(false);
    expect(finalsDue(at('2025-09-22 10:00'), marks, CAL, none, ctx('2025-09-29 10:00'))).toBe(true);
    // two weeks before the end: daily
    expect(finalsDue(at('2025-10-13 10:00'), marks, CAL, none, ctx('2025-10-14 10:00'))).toBe(true);
    expect(finalsDue(at('2025-10-14 09:00'), marks, CAL, none, ctx('2025-10-14 10:00'))).toBe(false);
    // the holidays after it, the term waiting for its finals: daily
    expect(finalsDue(at('2025-10-27 10:00'), marks, CAL, none, ctx('2025-10-28 10:00'))).toBe(true);
    const off = { ...marks, finals: 'off' as const };
    expect(finalsDue(null, off, CAL, none, ctx('2025-10-28 10:00'))).toBe(false);
  });
});
