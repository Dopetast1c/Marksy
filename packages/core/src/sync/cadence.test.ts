import { describe, expect, it } from 'vitest';
import { CADENCE_PRESETS, mergeCadences, resolveCadence } from './cadence';

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
