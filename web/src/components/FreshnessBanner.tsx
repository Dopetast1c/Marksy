import { useNavigate } from 'react-router';
import { useMe, useSyncStatus } from '../api/queries';
import { useSchoolTz } from '../hooks/useStudent';
import { useT } from '../i18n';
import { freshnessOf } from '../lib/freshness';
import { whenText } from '../lib/when';
import { ChevIcon } from './icons';

// One banner under the header of every student screen when the data is not fresh (ux-principles D22). For the admin
// and parents it opens Синхронизация, which says what happened and what the next run will take; a student has no
// such screen, so for them it stays a plain line without a chevron.

export function FreshnessBanner({ studentId }: { studentId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const me = useMe();
  const status = useSyncStatus();
  const tz = useSchoolTz(studentId);
  const f = freshnessOf(status.data, studentId);
  if (!f) return null;
  const when = f.since ? whenText(t, f.since, tz) : null;
  const text = when ? t(`fresh.${f.kind}`, { when }) : t(`fresh.${f.kind}.never`);
  const bad = f.kind === 'refused';
  const tone = bad
    ? 'bg-band-critical-bg text-band-critical-fg'
    : f.kind === 'loading'
      ? 'bg-accent-soft text-accent'
      : 'bg-band-low-bg text-band-low-fg';
  const cls = `rounded-md px-3 py-2 text-[12.5px] leading-[1.35] ${tone}`;
  if (me.data?.family?.role === 'student')
    return (
      <p role="status" className={cls}>
        {text}
      </p>
    );
  return (
    <button
      type="button"
      onClick={() => navigate('/more/sync')}
      className={`flex w-full items-center gap-2 text-left ${cls}`}
    >
      <span className="flex-1">{text}</span>
      <ChevIcon size={16} className="flex-none" />
    </button>
  );
}
