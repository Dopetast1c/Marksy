import { shortDate } from '@marksy/core';
import type { TFunction } from 'i18next';
import { dateStyle, intlLocale } from '../i18n';
import { formatTime, todayIn } from './time';

/** An instant as the school sees it: "today at 12:17" (time.todayAt), "Fri, 23 Oct at 12:17" (time.dayAt) (the
 * footer of Home, Sync) */
export function whenText(t: TFunction, at: string | Date, tz: string): string {
  const locale = intlLocale();
  const day = todayIn(tz, new Date(at));
  return day === todayIn(tz)
    ? t('time.todayAt', { time: formatTime(at, tz, locale) })
    : t('time.dayAt', { day: shortDate(day, dateStyle(), { weekday: true }), time: formatTime(at, tz, locale) });
}
