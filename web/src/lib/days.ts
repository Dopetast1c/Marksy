import { addDays } from '@marksy/core';
import type { ShortDateStyle } from '@marksy/core';
import type { TFunction } from 'i18next';

// The caption of a day in a list (Оценки, the subject's marks): «Сегодня · 15 октября», «Вчера · 14 октября»,
// «Понедельник · 12 октября». Today is the school's (lib/time.ts); weekday and month names come from Intl.

const plain = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function dayCaption(t: TFunction, date: string, today: string, ds: ShortDateStyle) {
  const label =
    date === today
      ? t('day.today')
      : date === addDays(today, -1)
        ? t('day.yesterday')
        : new Intl.DateTimeFormat(ds.locale, { timeZone: 'UTC', weekday: 'long' }).format(plain(date));
  return {
    label: label.charAt(0).toLocaleUpperCase(ds.locale) + label.slice(1),
    date: new Intl.DateTimeFormat(ds.locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(plain(date)),
  };
}
