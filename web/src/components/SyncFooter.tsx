import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, data } from '../api/client';
import { useMe, useSyncStatus } from '../api/queries';
import { useSchoolTz } from '../hooks/useStudent';
import { intlLocale, useT } from '../i18n';
import { freshnessOf } from '../lib/freshness';
import { formatTime } from '../lib/time';
import { whenText } from '../lib/when';

// The footer of Home (tabs.home; docs/design.md 5.2): one centred quiet line, when the child's data was last updated,
// and for the admin and parents "Refresh" (home.refresh): one run of the diary that reads the child, within its
// one-login-per-interval budget (it says "Refresh possible at 13:17", sync.refresh.allowedAt, when the budget is used
// up). A stale or paused state is the banner's job (D22).

export function SyncFooter({ studentId }: { studentId: string }) {
  const t = useT();
  const queries = useQueryClient();
  const me = useMe();
  const status = useSyncStatus();
  const tz = useSchoolTz(studentId);
  const [said, setSaid] = useState<string | null>(null);
  const since = status.data?.students.find((s) => s.id === studentId)?.lastSuccessAt as unknown as string | null;
  if (!since) return null;
  const when = whenText(t, since, tz);
  // "Updated …" (home.updated) while the data is fresh; "Data as of …" (home.dataFrom) once the banner says they are
  // not (the prototype's syncFoot)
  const fresh = !freshnessOf(status.data, studentId);
  const account = status.data?.accounts.find((a) => a.studentIds.includes(studentId));
  const parent = me.data?.family?.role !== 'student';
  const refresh = async () => {
    if (!account) return;
    let res;
    try {
      res = await data(api.POST('/api/sync/run', { body: { accountId: account.id } }));
    } catch {
      setSaid(t('sync.failed'));
      return;
    }
    setSaid(
      res.started
        ? t('sync.refresh.started')
        : res.retryAt
          ? t('sync.refresh.later', { at: formatTime(res.retryAt, tz, intlLocale()) })
          : t('sync.refresh.action'),
    );
    await queries.invalidateQueries({ queryKey: ['sync-status'] });
  };
  return (
    <p className="pt-1 text-center text-[12px] text-ink3">
      {t(fresh ? 'home.updated' : 'home.dataFrom', { when })}
      {parent && account && !said && (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => void refresh()}
            className="relative font-bold text-accent after:absolute after:-inset-3"
          >
            {t('home.refresh')}
          </button>
        </>
      )}
      {said && ` · ${said}`}
    </p>
  );
}
