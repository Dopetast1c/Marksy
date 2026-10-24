import { shortRange } from '@marksy/core';
import type { ShortDateStyle } from '@marksy/core';
import type { TFunction } from 'i18next';
import type { Schemas } from '../api/client';

// What the period controls say (docs/design.md 6, ux-principles D2): the kind ("Неделя", "Четверть" from the term's
// kind), the instance ("Эта неделя · 12–18 окт", "Этот месяц · октябрь", the diary's own term name) and, once, what
// "было" is compared with ("против 5–11 окт"). Short dates come from core's shortRange in the interface language;
// full month names from Intl.

export type Instance = Schemas['Period'];
export type Kind = 'week' | 'month' | 'term' | 'year';

const plain = (iso: string) => new Date(`${iso}T12:00:00Z`);
const capital = (s: string, locale: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
const monthName = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long' }).format(plain(iso));
const yearLabel = (i: Instance) => {
  const y = Number(i.from.slice(0, 4));
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
};

export function kindLabel(t: TFunction, kind: Kind, termKind: Instance['termKind'] = null): string {
  if (kind === 'term') return t(`term.${termKind ?? 'other'}`);
  return t(`period.${kind}`);
}

export function instanceTitle(t: TFunction, i: Instance, ds: ShortDateStyle): string {
  switch (i.kind) {
    case 'week':
      return i.offset === 0 ? t('period.thisWeek') : i.offset === 1 ? t('period.lastWeek') : t('period.week');
    case 'month':
      return i.offset === 0
        ? t('period.thisMonth')
        : i.offset === 1
          ? t('period.lastMonth')
          : capital(monthName(i.from, ds.locale), ds.locale);
    case 'term': {
      // the diary's own name of the term when it has one; else «I четверть» from the term's kind and number
      const index = i.termIndex ?? i.offset + 1;
      return i.termLabel ?? t(`period.termN.${i.termKind ?? 'other'}`, { roman: roman(index) });
    }
    default:
      return yearLabel(i);
  }
}

export function instanceSub(t: TFunction, i: Instance, ds: ShortDateStyle): string {
  const running = i.offset === 0 && i.kind !== 'week' && i.kind !== 'month';
  const what =
    i.kind === 'month'
      ? i.offset <= 1
        ? monthName(i.from, ds.locale)
        : i.from.slice(0, 4)
      : shortRange(i.from, i.end, ds);
  return running ? t('period.withRunning', { what }) : what;
}

/**
 * What "было" compares with, said once in the navigator: the instance right before the selected one. A week by its
 * dates ("против 5–11 окт"), a month by its name in the form a date uses ("против сентября", from Intl's day-and-month
 * format, so no month name is typed in a translation), a term by its kind ("против прошлой четверти"), a year by its label.
 */
export function comparedWith(t: TFunction, list: readonly Instance[], i: Instance, ds: ShortDateStyle): string {
  const prev = list.find((x) => x.offset === i.offset + 1);
  if (!prev) return t('period.nothingToCompare');
  switch (prev.kind) {
    case 'week':
      return t('period.vs', { what: shortRange(prev.from, prev.end, ds) });
    case 'month': {
      const month = new Intl.DateTimeFormat(ds.locale, { timeZone: 'UTC', day: 'numeric', month: 'long' })
        .formatToParts(plain(prev.from))
        .find((p) => p.type === 'month')?.value;
      return t('period.vs', { what: month ?? monthName(prev.from, ds.locale) });
    }
    case 'term':
      return t(`period.vsPrevTerm.${prev.termKind ?? 'other'}`);
    default:
      return t('period.vs', { what: yearLabel(prev) });
  }
}

/** I, II, III, IV: how terms are numbered in a school year (the label sits next to the term word in the language) */
export function roman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) for (; n >= v; n -= v) out += s;
  return out;
}

/** «за неделю», «за четверть»: the period's span in a phrase («нет оценок за неделю») */
export function forPeriod(t: TFunction, kind: Kind, termKind: Instance['termKind'], locale: string): string {
  return t(`period.for.${kind}`, { name: t(`term.${termKind ?? 'other'}`).toLocaleLowerCase(locale) });
}
