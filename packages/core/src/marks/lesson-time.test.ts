import { describe, expect, it } from 'vitest';
import { lessonNow, lessonPassed, schoolClock } from './lesson-time';

// Europe/Minsk is UTC+3 all year: 10:40 at school is 07:40 UTC.
const TZ = 'Europe/Minsk';
const at = (iso: string) => new Date(iso);

describe('lessonPassed', () => {
  const lesson = { date: '2026-10-21', start: '09:55', end: '10:40' };

  it('a minute before the end the lesson is still on, a minute after it has passed', () => {
    expect(lessonPassed(lesson, at('2026-10-21T07:39:00Z'), TZ)).toBe(false);
    expect(lessonPassed(lesson, at('2026-10-21T07:40:00Z'), TZ)).toBe(true);
    expect(lessonPassed(lesson, at('2026-10-21T07:41:00Z'), TZ)).toBe(true);
  });

  it('follows the school’s zone, not the instant’s UTC day', () => {
    // 22:30 UTC on the 20th is already 01:30 on the 21st in Minsk: the lesson is today and ahead
    expect(schoolClock(at('2026-10-20T22:30:00Z'), TZ)).toEqual({ date: '2026-10-21', minutes: 90 });
    expect(lessonPassed(lesson, at('2026-10-20T22:30:00Z'), TZ)).toBe(false);
  });

  it('without an end time a lesson passes on the next day', () => {
    const noBells = { date: '2026-10-21', end: null };
    expect(lessonPassed(noBells, at('2026-10-21T20:59:00Z'), TZ)).toBe(false);
    expect(lessonPassed(noBells, at('2026-10-21T21:00:00Z'), TZ)).toBe(true);
  });

  it('earlier days have passed, later days have not', () => {
    expect(lessonPassed({ date: '2026-10-20', end: '23:59' }, at('2026-10-21T05:00:00Z'), TZ)).toBe(true);
    expect(lessonPassed({ date: '2026-10-22', end: '08:00' }, at('2026-10-21T20:00:00Z'), TZ)).toBe(false);
  });
});

describe('lessonNow', () => {
  const lesson = { date: '2026-10-21', start: '09:55', end: '10:40' };
  it('is the span from start to end, on the lesson’s day', () => {
    expect(lessonNow(lesson, at('2026-10-21T06:54:00Z'), TZ)).toBe(false);
    expect(lessonNow(lesson, at('2026-10-21T06:55:00Z'), TZ)).toBe(true);
    expect(lessonNow(lesson, at('2026-10-21T07:39:00Z'), TZ)).toBe(true);
    expect(lessonNow(lesson, at('2026-10-21T07:40:00Z'), TZ)).toBe(false);
    expect(lessonNow({ ...lesson, start: null }, at('2026-10-21T07:00:00Z'), TZ)).toBe(false);
  });
});
