import { shortDate } from '@marksy/core';
import type { ShortDateStyle } from '@marksy/core';
import type { TFunction } from 'i18next';
import type { FinalsState, TermRef } from '../api/queries';
import { roman } from './period';

// What the finals entry row and the Итоги header say (docs/design.md 5.3, 5.3b): «I четверть идёт, итоги после 31 окт»,
// «I четверть закончилась, итогов пока нет», «I четверть выставлена 15 октября» / «… сегодня». The term is named from its
// kind and number through i18n, never typed; the words agree with the kind in each language.

/** «I четверть» from the term's kind and number */
export const termName = (t: TFunction, term: Pick<TermRef, 'kind' | 'index'>) =>
  t(`period.termN.${term.kind}`, { roman: roman(term.index) });

/** «15 октября» */
export const longDay = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

export function finalsStateText(t: TFunction, s: FinalsState, ds: ShortDateStyle, today: string): string {
  const term = termName(t, s.term);
  switch (s.state) {
    case 'running':
      return t('finals.running', { term, date: shortDate(s.term.to, ds) });
    case 'ended':
      return t(`finals.ended.${s.term.kind}`, { term });
    default:
      return s.postedOn === today
        ? t(`finals.postedToday.${s.term.kind}`, { term })
        : s.postedOn
          ? t(`finals.posted.${s.term.kind}`, { term, date: longDay(s.postedOn, ds.locale) })
          : t(`finals.postedPlain.${s.term.kind}`, { term });
  }
}

/** A school year's label as the app writes it: «2026/27» from the diary's «2026-2027» */
export function schoolYearLabel(label: string): string {
  const m = /^(\d{4})\D+(\d{2})?(\d{2})$/.exec(label.trim());
  return m ? `${m[1]}/${m[3]}` : label;
}
