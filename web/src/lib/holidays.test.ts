import { beforeAll, describe, expect, it } from 'vitest';
import { i18n, initI18n } from '../i18n';
import { holidayName, holidaysFrom } from './holidays';

beforeAll(() => {
  initI18n('ru');
});

describe('holiday names', () => {
  it('come from the kind the diary gives, never from the month', () => {
    const t = i18n.t.bind(i18n);
    expect(holidayName(t, 'autumn')).toBe('Осенние каникулы');
    expect(holidaysFrom(t, 'autumn', '1 ноя')).toBe('С 1 ноя осенние каникулы');
    expect(holidayName(t, 'additional')).toBe('Дополнительные каникулы');
    // no kind, or one the app has no name for: just «Каникулы»
    expect(holidayName(t, null)).toBe('Каникулы');
    expect(holidayName(t, 'other')).toBe('Каникулы');
    expect(holidaysFrom(t, null, '1 ноя')).toBe('С 1 ноя каникулы');
  });
});
