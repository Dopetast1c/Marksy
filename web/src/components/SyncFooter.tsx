import { shortDate } from '@marksy/core';
import { useSyncStatus } from '../api/queries';
import { useSchoolTz } from '../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../i18n';
import { freshnessOf } from '../lib/freshness';
import { formatTime, todayIn } from '../lib/time';

// The footer of Главная (docs/design.md 5.2): one centred quiet line, when the child's data was last updated. The
// manual «Обновить» joins it with the Sync screen (M5d); a stale or paused state is the banner's job (D22).

export function SyncFooter({ studentId }: { studentId: string }) {
  const t = useT();
  const status = useSyncStatus();
  const tz = useSchoolTz(studentId);
  const since = status.data?.students.find((s) => s.id === studentId)?.lastSuccessAt as unknown as string | null;
  if (!since) return null;
  const locale = intlLocale();
  const day = todayIn(tz, new Date(since));
  const when =
    day === todayIn(tz)
      ? t('time.todayAt', { time: formatTime(since, tz, locale) })
      : t('time.dayAt', { day: shortDate(day, dateStyle(), { weekday: true }), time: formatTime(since, tz, locale) });
  // «Обновлено …» while the data is fresh; «Данные от …» once the banner says they are not (the prototype's syncFoot)
  const fresh = !freshnessOf(status.data, studentId);
  return (
    <p className="pt-1 text-center text-[12px] text-ink3">{t(fresh ? 'home.updated' : 'home.dataFrom', { when })}</p>
  );
}
