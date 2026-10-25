import type { TFunction } from 'i18next';
import type { FamilyView, SyncStatus } from '../../api/queries';
import { intlLocale } from '../../i18n';
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
  const words = t(`term.${terms}.plural`).toLocaleLowerCase(intlLocale());
  return name ? t('more.school.subFor', { name, terms: words }) : t('more.school.sub', { terms: words });
}

type Account = SyncStatus['accounts'][number];
const PROBLEM = ['auth_failed', 'blocked', 'needs_2fa', 'paused', 'stale', 'loading'] as const;
const capitalised = (s: string) => s.charAt(0).toLocaleUpperCase(intlLocale()) + s.slice(1);

/**
 * «Сегодня в 12:17 · следующая около 13:00»; a diary with a problem says it instead («нужен новый пароль»,
 * «дневник не отвечает»). Several diaries: the one with a problem first, otherwise the one read longest ago.
 */
export function syncLine(t: TFunction, status: SyncStatus | undefined, tzOf: (a: Account) => string): string | null {
  if (!status) return null;
  const accounts = status.accounts;
  if (!accounts.length) return t('more.sync.none');
  const troubled = accounts.find((a) => (PROBLEM as readonly string[]).includes(a.status));
  if (troubled) return capitalised(t(`more.sync.problem.${troubled.status}`));
  const a = [...accounts].sort((x, y) =>
    String(x.lastSuccessAt ?? '').localeCompare(String(y.lastSuccessAt ?? '')),
  )[0]!;
  const tz = tzOf(a);
  const last = a.lastSuccessAt
    ? capitalised(whenText(t, a.lastSuccessAt as unknown as string, tz))
    : t('more.sync.never');
  const n = a.plan?.next;
  let next: string | null = null;
  if (n?.kind === 'now' || n?.kind === 'soon') next = t('more.sync.nextSoon');
  else if (n?.kind === 'nextSchoolDay') next = t('more.sync.nextSchoolDay');
  else if (n?.kind === 'at' && n.at) {
    const at = n.at as unknown as string;
    next =
      todayIn(tz, new Date(at)) === todayIn(tz)
        ? t('more.sync.nextAt', { time: formatTime(at, tz, intlLocale()) })
        : t('more.sync.nextOn', { when: whenText(t, at, tz) });
  }
  return [last, next].filter(Boolean).join(' · ');
}
