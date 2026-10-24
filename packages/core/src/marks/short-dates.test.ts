import { describe, expect, it } from 'vitest';
import en from '../../../i18n/src/locales/en.json';
import ru from '../../../i18n/src/locales/ru.json';
import { shortDate, shortRange } from './short-dates';
import type { ShortDateStyle } from './short-dates';

const months = (catalog: Record<string, string>) =>
  Array.from({ length: 12 }, (_, i) => catalog[`date.monthShort.${i + 1}`]!);
const RU: ShortDateStyle = { locale: 'ru-RU', months: months(ru) };
const EN: ShortDateStyle = { locale: 'en-GB', months: months(en) };

describe('short dates, as the design writes them', () => {
  it('Russian: no dot after the month', () => {
    expect(shortRange('2026-10-12', '2026-10-18', RU)).toBe('12–18 окт');
    expect(shortRange('2026-11-01', '2026-11-08', RU)).toBe('1–8 ноя');
    expect(shortRange('2026-09-28', '2026-10-04', RU)).toBe('28 сен – 4 окт');
    expect(shortDate('2026-10-15', RU)).toBe('15 окт');
    expect(shortDate('2026-10-15', RU, { weekday: true })).toBe('чт, 15 окт');
    expect(shortDate('2026-05-01', RU)).toBe('1 мая');
  });

  it('English', () => {
    expect(shortRange('2026-10-12', '2026-10-18', EN)).toBe('12–18 Oct');
    expect(shortRange('2026-09-28', '2026-10-04', EN)).toBe('28 Sep – 4 Oct');
    expect(shortDate('2026-10-15', EN, { weekday: true })).toBe('Thu, 15 Oct');
  });

  it('a language without its own month names gets Intl', () => {
    const pl: ShortDateStyle = { locale: 'pl-PL', months: null };
    expect(shortDate('2026-10-15', pl)).toBe(
      new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date('2026-10-15T12:00:00Z'),
      ),
    );
    expect(shortRange('2026-10-12', '2026-10-12', pl)).toBe(shortDate('2026-10-12', pl));
  });
});
