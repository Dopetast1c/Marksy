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
    case 'term':
      return (
        i.termLabel ??
        t('period.termN', { index: i.termIndex ?? i.offset + 1, name: t(`term.${i.termKind ?? 'other'}`) })
      );
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

/** What "было" compares with, said once in the navigator: the instance right before the selected one */
export function comparedWith(t: TFunction, list: readonly Instance[], i: Instance, ds: ShortDateStyle): string {
  const prev = list.find((x) => x.offset === i.offset + 1);
  if (!prev) return t('period.nothingToCompare');
  return t('period.vs', { what: prev.kind === 'year' ? yearLabel(prev) : shortRange(prev.from, prev.end, ds) });
}
