import { useNavigate } from 'react-router';
import { usePeriods } from '../api/queries';
import { useCapabilities, useScale, useSchoolTz } from '../hooks/useStudent';
import { dateStyle, useT } from '../i18n';
import { finalsStateText } from '../lib/finals';
import { todayIn } from '../lib/time';
import { ChevIcon, SchoolIcon } from './icons';

// The finals entry row on Оценки and Предметы (docs/design.md 5.3): «Итоговые отметки · по четвертям и годам · I четверть
// идёт, итоги после 31 окт», opening Итоги. While a term's finals are news (posted, the next term not started) the line
// says so in the good-news colour; the finals stay on their own screen, never mixed into the current marks. Only where
// the diary has final marks and the child gets marks.

export function FinalsEntry({ studentId }: { studentId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const caps = useCapabilities(studentId);
  const scale = useScale(studentId);
  const tz = useSchoolTz(studentId);
  const periods = usePeriods(studentId);
  // a year without marks has no finals (D49)
  if (!caps?.finalMarks || !scale) return null;
  const state = periods.data?.finals ?? null;
  const hot = state?.state === 'posted';
  const scope = caps.terms && caps.terms !== 'none' ? t(`finals.scope.${caps.terms}`) : t('finals.scope.years');
  const line = state ? finalsStateText(t, state, dateStyle(), todayIn(tz)) : null;
  return (
    <button
      type="button"
      onClick={() => navigate(`/s/${studentId}/finals`)}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card"
    >
      <span className="grid size-8 flex-none place-items-center rounded-[9px] bg-accent-soft text-accent">
        <SchoolIcon size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[14px]">{t('finals.title')}</b>
        <span className={`text-[12.5px] ${hot ? 'font-bold text-band-good-fg' : 'text-ink3'}`}>
          {hot ? line : [scope, line].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ChevIcon className="flex-none text-ink3" />
    </button>
  );
}
