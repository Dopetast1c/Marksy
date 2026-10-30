import { beforeAll, describe, expect, it } from 'vitest';
import { i18n, initI18n } from '../i18n';
import { holidayName, holidaysFrom } from './holidays';

beforeAll(() => {
  initI18n('en');
});

describe('holiday names', () => {
  it('come from the kind the diary gives, never from the month', () => {
    const t = i18n.t.bind(i18n);
    expect(holidayName(t, 'autumn')).toBe('Autumn holidays');
    expect(holidaysFrom(t, 'autumn', '1 Nov')).toBe('Autumn holidays from 1 Nov');
    expect(holidayName(t, 'additional')).toBe('Extra holidays');
    // no kind, or one the app has no name for: just "Holidays" (schedule.holidays)
    expect(holidayName(t, null)).toBe('Holidays');
    expect(holidayName(t, 'other')).toBe('Holidays');
    expect(holidaysFrom(t, null, '1 Nov')).toBe('Holidays from 1 Nov');
  });
});
