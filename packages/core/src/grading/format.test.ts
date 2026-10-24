import { describe, expect, it } from 'vitest';
import { formatAverage, formatBandRange, formatFinal, formatValue } from './format';
import { by10, de16, pct100, ru5 } from './scales';

// How numbers are written (docs/i18n.md 2): the separator is the interface language's, the number of decimals is the
// scale's. The scale snapshots (by-10.snapshot.test.ts) pin the values; this file pins the writing per language.

describe('numbers in the interface language', () => {
  it('an average: the scale’s decimals, the language’s separator, never a 0 for nothing', () => {
    expect(formatAverage(by10, 8.3, 'ru')).toBe('8,3');
    expect(formatAverage(by10, 8.3, 'en')).toBe('8.3');
    expect(formatAverage(by10, 8, 'ru')).toBe('8,0');
    expect(formatAverage(by10, 8, 'en')).toBe('8.0');
    expect(formatAverage(by10, 8.25, 'de')).toBe('8,3');
    expect(formatAverage(ru5, 4.333, 'ru')).toBe('4,33');
    expect(formatAverage(ru5, 4.333, 'en')).toBe('4.33');
    expect(formatAverage(by10, null, 'ru')).toBe('—');
    expect(formatAverage(by10, null, 'en')).toBe('—');
  });

  it('a mark, a final, a band range: whole values with no separator; a half step with one', () => {
    expect(formatValue(by10, 9, 'ru')).toBe('9');
    expect(formatFinal(by10, 8, 'en')).toBe('8');
    expect(formatValue({ ...ru5, step: 0.5 }, 4.5, 'ru')).toBe('4,5');
    expect(formatValue({ ...ru5, step: 0.5 }, 4.5, 'en')).toBe('4.5');
    expect(formatBandRange(by10, 'low', 'ru')).toBe('5–6');
    expect(formatBandRange(de16, 'top', 'en')).toBe('1');
    expect(formatValue(pct100, 87, 'ru')).toBe('87%');
  });

  it('a long number is never grouped («1 000» would read as two marks)', () => {
    expect(formatValue({ ...pct100, max: 2000 }, 1000, 'ru')).toBe('1000%');
  });
});
