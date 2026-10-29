import { inSentence } from '@marksy/i18n';
import { shortDate } from '@marksy/core';
import type { TFunction } from 'i18next';
import type { FamilyView, SyncStatus } from '../../api/queries';
import { dateStyle, intlLocale } from '../../i18n';
import { formatTime, todayIn } from '../../lib/time';
import { whenText } from '../../lib/when';

// The live lines under Ещё's rows (docs/design.md 5.6): what the family has, what this child's school has, how the
// diaries are read. Each says the state in a few words; a problem replaces the times, so it is what is read first.

type TermKind = 'quarter' | 'trimester' | 'semester' | 'other' | 'none';

/** «4 участника · Милена, Марк · 1 дневник» */
export function familyLine(t: TFunction, view: FamilyView): string {
  return [
    t('more.family.members', { count: view.members.length }),
    view.children.map((c) => c.name).join(', '),
    t('more.family.diaries', { count: view.accounts.length }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** «Милена: звонки, четверти и каникулы»: the periods' word from Term.kind, never typed; without terms, only bells */
export function schoolLine(t: TFunction, terms: TermKind, name: string | null): string {
  if (terms === 'none') return name ? t('more.school.subForPlain', { name }) : t('more.school.subPlain');
  const words = inSentence(t(`term.${terms}.plural`), intlLocale());
  return name ? t('more.school.subFor', { name, terms: words }) : t('more.school.sub', { terms: words });
}

type Account = SyncStatus['accounts'][number];
type Next = NonNullable<Account['plan']>['next'];
/** What is wrong with a diary: said instead of the times, in the warning colour of its weight */
const PROBLEM = {
  auth_failed: 'critical',
  blocked: 'critical',
  needs_2fa: 'critical',
  paused: 'low',
  stale: 'low',
} as const;
const capitalised = (s: string) => s.charAt(0).toLocaleUpperCase(intlLocale()) + s.slice(1);

export interface SyncLine {
  text: string;
  /** a problem's weight; neutral for the times, for «нет дневников» and for a run in progress */
  tone: 'neutral' | 'low' | 'critical';
}

/**
 * When the next run is (Ещё and Синхронизация): «около 13:00» today, «пн, 26 окт в 08:13» on another day, «после
 * каникул, пн, 9 ноя» across holidays; the general «в учебный день» only when the planner does not know the day.
 */
export function nextRunText(t: TFunction, n: Next | undefined, tz: string): string | null {
  if (!n) return null;
  if (n.kind === 'now' || n.kind === 'soon') return t('more.sync.nextSoon');
  if (n.kind === 'nextSchoolDay') {
    if (!n.date) return t('more.sync.nextSchoolDay');
    const day = shortDate(n.date, dateStyle(), { weekday: true });
    if (n.afterHolidays) return t('more.sync.nextAfterHolidays', { when: day });
    return t('more.sync.nextOn', { when: n.at ? whenText(t, n.at as unknown as string, tz) : day });
  }
  if (n.kind === 'at' && n.at) {
    const at = n.at as unknown as string;
    return todayIn(tz, new Date(at)) === todayIn(tz)
      ? t('more.sync.nextAt', { time: formatTime(at, tz, intlLocale()) })
      : t('more.sync.nextOn', { when: whenText(t, at, tz) });
  }
  return null;
}

/**
 * «Сегодня в 12:17 · следующая около 13:00»; a diary with a problem says it instead («Нужен новый пароль», «Дневник
 * не отвечает»), in the warning colour. A run in progress is a state, not a problem: «Читаем дневник», neutral.
 * Several diaries: a problem first, then a run in progress, otherwise the one read longest ago.
 */
export function syncLine(t: TFunction, status: SyncStatus | undefined, tzOf: (a: Account) => string): SyncLine | null {
  if (!status) return null;
  const accounts = status.accounts;
  if (!accounts.length) return { text: t('more.sync.none'), tone: 'neutral' };
  const troubled = accounts.find((a) => a.status in PROBLEM);
  if (troubled) {
    const status = troubled.status as keyof typeof PROBLEM;
    return { text: capitalised(t(`more.sync.problem.${status}`)), tone: PROBLEM[status] };
  }
  if (accounts.some((a) => a.status === 'loading')) return { text: t('more.sync.reading'), tone: 'neutral' };
  const a = [...accounts].sort((x, y) =>
    String(x.lastSuccessAt ?? '').localeCompare(String(y.lastSuccessAt ?? '')),
  )[0]!;
  const tz = tzOf(a);
  const last = a.lastSuccessAt
    ? capitalised(whenText(t, a.lastSuccessAt as unknown as string, tz))
    : t('more.sync.never');
  return { text: [last, nextRunText(t, a.plan?.next, tz)].filter(Boolean).join(' · '), tone: 'neutral' };
}
