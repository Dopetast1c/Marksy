import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CATALOGS,
  checkCatalogs,
  createT,
  formatList,
  isReviewed,
  LANGUAGES,
  pickerOrder,
  resolveLanguage,
  translator,
} from './index';

describe('translation status', () => {
  it('every language has the status locales/STATUS.md gives it; only a language with a file can be checked', () => {
    const table = readFileSync(fileURLToPath(new URL('./locales/STATUS.md', import.meta.url)), 'utf8');
    const rows = new Map([...table.matchAll(/^\| (\w{2}) \| [^|]+ \| (\w+)/gm)].map((m) => [m[1]!, m[2]!] as const));
    expect([...rows.keys()].sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    for (const l of LANGUAGES) {
      expect(l.status, l.code).toBe(rows.get(l.code));
      if (isReviewed(l)) expect(CATALOGS[l.code], l.code).toBeDefined();
    }
  });
});

describe('catalogs', () => {
  it('en and ru have every key, plural form and placeholder', () => {
    expect(checkCatalogs(CATALOGS)).toEqual({ errors: [], warnings: [] });
  });

  it('the check catches what it should', () => {
    const en = { a: 'A {{x}}', n_one: '{{count}} n', n_other: '{{count}} n' };
    const result = checkCatalogs({
      en,
      ru: { a: 'А {{y}}', n_one: '{{count}}', n_other: '{{count}}', extra: 'x' },
      pl: { a: 'A {{x}}' },
    });
    // ru is a complete language: everything is an error; pl is not translated yet: a missing key is a warning
    expect(result).toEqual({
      errors: [
        'ru: a uses {{y}} which en does not have',
        'ru: n lacks plural forms few, many',
        'ru: extra does not exist in en',
      ],
      warnings: ['pl: missing n'],
    });
  });
});

describe('t()', () => {
  it('interpolates and picks Russian plural forms', () => {
    const t = translator('ru');
    expect([1, 2, 5, 11, 21, 22].map((count) => t('marks.count', { count }))).toEqual([
      '1 оценка',
      '2 оценки',
      '5 оценок',
      '11 оценок',
      '21 оценка',
      '22 оценки',
    ]);
    expect(t('threshold.below', { value: '5' })).toBe('Ниже 5');
  });

  it('falls back to English, then to the key', () => {
    expect(translator('pl')('period.week')).toBe('Week');
    expect(translator('pl')('marks.count', { count: 3 })).toBe('3 marks');
    expect(createT('ru', { en: { a: 'A' }, ru: {} })('a')).toBe('A');
    expect(translator('en')('no.such.key')).toBe('no.such.key');
  });

  it('lists in the interface language', () => {
    expect(formatList('en', ['a', 'b', 'c'], 'disjunction')).toBe('a, b or c');
    expect(formatList('ru', ['a', 'b'], 'disjunction')).toBe('a или b');
  });
});

describe('languages', () => {
  it('twelve, the provider suggests the order and never restricts it', () => {
    expect(LANGUAGES).toHaveLength(12);
    const order = pickerOrder(['ru', 'be']).map((l) => l.code);
    expect(order.slice(0, 3)).toEqual(['ru', 'be', 'uk']);
    expect(order).toHaveLength(12);
  });

  it('resolves: saved, provider default, browser, English', () => {
    expect(resolveLanguage({ saved: 'pl', providerDefault: 'ru' })).toBe('pl');
    expect(resolveLanguage({ providerDefault: 'ru', browser: ['de-DE'] })).toBe('ru');
    expect(resolveLanguage({ browser: ['xx', 'uk-UA'] })).toBe('uk');
    expect(resolveLanguage({})).toBe('en');
  });
});
