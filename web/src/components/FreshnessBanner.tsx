import { useSyncStatus } from '../api/queries';
import { useSchoolTz } from '../hooks/useStudent';
import { shortDate } from '@marksy/core';
import { dateStyle, intlLocale, useT } from '../i18n';
import { freshnessOf } from '../lib/freshness';
import { formatTime, todayIn } from '../lib/time';

// One banner under the header of every student screen when the data is not fresh (ux-principles D22). It opens the
// Sync screen once that screen exists (M5d); until then it is a plain line, with no chevron, so it does not look
// like a button (owner, M5a).

export function FreshnessBanner({ studentId }: { studentId: string }) {
  const t = useT();
  const status = useSyncStatus();
  const tz = useSchoolTz(studentId);
  const f = freshnessOf(status.data, studentId);
  if (!f) return null;
  const locale = intlLocale();
  const when = f.since
    ? todayIn(tz, new Date(f.since)) === todayIn(tz)
      ? t('time.todayAt', { time: formatTime(f.since, tz, locale) })
      : t('time.dayAt', {
          day: shortDate(todayIn(tz, new Date(f.since)), dateStyle(), { weekday: true }),
          time: formatTime(f.since, tz, locale),
        })
    : null;
  const text = when ? t(`fresh.${f.kind}`, { when }) : t(`fresh.${f.kind}.never`);
  const bad = f.kind === 'refused';
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-[12.5px] leading-[1.35] ${bad ? 'bg-band-critical-bg text-band-critical-fg' : f.kind === 'loading' ? 'bg-accent-soft text-accent' : 'bg-band-low-bg text-band-low-fg'}`}
    >
      {text}
    </p>
  );
}
