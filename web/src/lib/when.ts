import { shortDate } from '@marksy/core';
import type { TFunction } from 'i18next';
import { dateStyle, intlLocale } from '../i18n';
import { formatTime, todayIn } from './time';

/** An instant as the school sees it: «сегодня в 12:17», «пт, 23 окт в 12:17» (the footer of Главная, Синхронизация) */
export function whenText(t: TFunction, at: string | Date, tz: string): string {
  const locale = intlLocale();
  const day = todayIn(tz, new Date(at));
  return day === todayIn(tz)
    ? t('time.todayAt', { time: formatTime(at, tz, locale) })
    : t('time.dayAt', { day: shortDate(day, dateStyle(), { weekday: true }), time: formatTime(at, tz, locale) });
}
