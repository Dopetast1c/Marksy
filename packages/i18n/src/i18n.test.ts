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
  pseudoCatalog,
  pseudoString,
  resolveLanguage,
  sourceStamps,
  translator,
} from './index';
import type { SourceStamps } from './index';

const stamps = JSON.parse(
  readFileSync(fileURLToPath(new URL('./locales/_source.json', import.meta.url)), 'utf8'),
) as SourceStamps;

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
  it('no errors: en and ru have every key, plural form and placeholder, ru follows the English of today', () => {
    // the machine translations may lag inside a milestone (warnings); pnpm i18n:check --strict before the merge
    expect(checkCatalogs(CATALOGS, stamps).errors).toEqual([]);
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

  it('a translation made from another English text is stale: an error in ru, a warning in a machine language', () => {
    const en = { a: 'A', n_one: '{{count}} n', n_other: '{{count}} n' };
    const made = sourceStamps(en);
    const later = { ...en, n_other: '{{count}} ns' };
    const ru = { a: 'А', n_one: '{{count}}', n_few: '{{count}}', n_many: '{{count}}', n_other: '{{count}}' };
    const pl = { ...ru };
    expect(checkCatalogs({ en: later, ru, pl }, { ru: made, pl: made })).toEqual({
      errors: ['ru: n is stale, en changed since it was translated'],
      warnings: ['pl: n is stale, en changed since it was translated'],
    });
    // a key never stamped is stale too; one stamped from today's text is not
    expect(checkCatalogs({ en, ru }, { ru: { n: made.n! } }).errors).toEqual([
      'ru: a is stale, en changed since it was translated',
    ]);
  });

  it('a key with a length limit is checked in every language', () => {
    const en = { tab: 'Home', tab_comment: 'a bottom tab: max 6 chars' };
    expect(checkCatalogs({ en, ru: { tab: 'Главная' } }).errors).toEqual(['ru: tab has 7 characters, at most 6']);
    expect(checkCatalogs({ en, ru: { tab: 'Дом' } }).errors).toEqual([]);
  });
});

describe('pseudo-locale', () => {
  it('accents and lengthens every string, keeps placeholders and plural keys, drops comments', () => {
    expect(pseudoString('Below {{value}}')).toBe('[Ɓéĺóŵ {{value}}~~]');
    // long padding comes in words, so a paragraph still wraps
    expect(pseudoString('a'.repeat(40))).toBe(`[${'á'.repeat(40)} ~~~~~ ~~~~~ ~~]`);
    // a key with a limit is filled to exactly its limit
    expect(pseudoString('Home', 11)).toBe('[Ĥóɱé~~~~~]');
    expect(pseudoString('Aa', 2)).toBe('Áá');
    const qps = pseudoCatalog(CATALOGS.en!);
    expect([...qps['tabs.schedule']!]).toHaveLength(11);
    expect(qps['marks.count_one']).toContain('{{count}}');
    expect(Object.keys(qps).some((k) => k.endsWith('_comment'))).toBe(false);
    expect(Object.keys(qps)).toHaveLength(Object.keys(CATALOGS.en!).filter((k) => !k.endsWith('_comment')).length);
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
