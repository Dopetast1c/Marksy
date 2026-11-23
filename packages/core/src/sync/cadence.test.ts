import { describe, expect, it } from 'vitest';
import { CADENCE_PRESETS, estimateDay, mergeCadences, resolveCadence } from './cadence';

describe('a child’s sync settings', () => {
  it('follow the year: marks with a scale, noMarks without, unless the family chose a mode', () => {
    expect(resolveCadence(undefined, true)).toEqual(CADENCE_PRESETS.marks);
    expect(resolveCadence(undefined, false)).toEqual(CADENCE_PRESETS.noMarks);
    expect(resolveCadence({ mode: 'light' }, true)).toEqual(CADENCE_PRESETS.light);
    expect(resolveCadence({ mode: 'marks' }, false)).toEqual(CADENCE_PRESETS.marks);
  });

  it('custom: the changed settings over the year’s preset; unknown keys and values are ignored', () => {
    const custom = resolveCadence(
      { mode: 'custom', custom: { day: 'every2h', finals: 'sometimes', colour: 'red' } as Record<string, string> },
      true,
    );
    expect(custom).toEqual({ ...CADENCE_PRESETS.marks, day: 'every2h' });
    // a mode this version does not know is the year's preset
    expect(resolveCadence({ mode: 'turbo' as never }, false)).toEqual(CADENCE_PRESETS.noMarks);
  });

  it('a child two families follow is read with the most frequent of their settings', () => {
    const merged = mergeCadences([
      CADENCE_PRESETS.noMarks,
      { ...CADENCE_PRESETS.light, termRecheck: 'monthly', school: 'weekly' },
    ]);
    expect(merged).toEqual({
      day: 'afterSchool',
      previousWeek: 'daily',
      nextWeek: 'lastSchoolDay',
      termRecheck: 'monthly',
      finals: 'termEnd',
      school: 'weekly',
      calendar: 'monthly',
    });
    expect(mergeCadences([])).toBeNull();
  });
});

describe('the estimate of a school day', () => {
  // a fictional seventh-grader: 07:00 to 16:45, a 9-week term, one request a week, an hourly login
  const day = {
    windowMinutes: 585,
    intervalMinutes: 60,
    weekRequests: 1,
    schoolDays: 5,
    termWeeks: 9,
    readsAhead: true,
    finalMarks: true,
  };

  it('with marks: a run an hour, the neighbouring weeks once a day, the term over a week', () => {
    // 10 runs: 10 logins + 10 current weeks + 1 previous + 2.8 next + 1.8 re-check + 0.2 finals
    expect(estimateDay(CADENCE_PRESETS.marks, day)).toEqual({ runs: 10, requests: 26, markWithinMinutes: 60 });
  });

  it('without marks: one run after the lessons, next week on the last school day', () => {
    expect(estimateDay(CADENCE_PRESETS.noMarks, { ...day, windowMinutes: 290 })).toEqual({
      runs: 1,
      requests: 2,
      markWithinMinutes: null,
    });
  });

  it('follows the login interval and leaves out what the provider cannot serve', () => {
    const slow = estimateDay({ ...CADENCE_PRESETS.marks, day: 'every2h' }, { ...day, intervalMinutes: 180 });
    expect(slow.runs).toBe(4);
    expect(slow.markWithinMinutes).toBe(180);
    const plain = estimateDay(CADENCE_PRESETS.marks, { ...day, readsAhead: false, finalMarks: false });
    expect(plain.requests).toBe(23);
    // a provider that answers per day pays a week as its school days
    // 1 login + 5 × (1 current + 1 previous + 0.2 next + 0.9 re-check) + 0.2 finals
    expect(estimateDay(CADENCE_PRESETS.light, { ...day, weekRequests: 5 }).requests).toBe(17);
  });
});
