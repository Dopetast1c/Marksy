import { addDays, bandOf, formatAverage } from '@marksy/core';
import type { ReactNode } from 'react';
import type { StudentSummary, useStudentCards } from '../api/queries';
import { intlLocale, useT } from '../i18n';
import { nowLineText } from '../lib/now';
import { todayIn } from '../lib/time';
import { Avatar, defaultTraits } from './Avatar';
import { ChangeArrow } from './ChangeArrow';
import { ClockIcon } from './icons';

// One card of «С кого начнём?» (docs/design.md 4, ux-principles D10): avatar, name and class (and the school when
// the children's schools differ), two or three small stat cells, and during school hours the child's own line. The
// whole card is the button; nothing else on it. The nearest lesson with a tag comes with tags (M6); until then the
// card has no such line at all (owner, M5a).

export type StudentCard = NonNullable<ReturnType<typeof useStudentCards>['data']>[number];

const BAND_TEXT = {
  critical: 'text-band-critical-fg',
  low: 'text-band-low-fg',
  good: 'text-band-good-fg',
  top: 'text-band-top-fg-text',
} as const;

function Cell({
  label,
  value,
  tone = 'text-ink',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-surface2 px-3 py-2.5">
      {/* three cells share 288 px on a 360 px phone: a little less tracking keeps «Пропуски» whole */}
      <span className="text-label tracking-[0.03em] text-ink3 uppercase">{label}</span>
      <span className={`font-display text-[24px] leading-[1.1] font-semibold ${tone}`}>{value}</span>
      {hint && <span className="truncate text-[11px] text-ink3">{hint}</span>}
    </div>
  );
}

export function StudentPickerCard({
  card,
  summary,
  index,
  onPick,
}: {
  card: StudentCard;
  summary: StudentSummary | undefined;
  index: number;
  onPick: () => void;
}) {
  const t = useT();
  const locale = intlLocale();
  const scale = summary?.gradingScale ?? null;
  const attendance = !!summary?.capabilities?.attendance;
  const w = card.week;
  let cells: ReactNode;
  // a year without marks (no scale, D49) counts tomorrow's lessons and homework instead
  if (scale) {
    const avg = w?.current === 'marks' ? w.average : null;
    const band = bandOf(scale, avg);
    cells = (
      <>
        <Cell label={t('pick.new')} value={card.newCount} tone={card.newCount ? 'text-accent' : 'text-ink3'} />
        <Cell
          label={t('pick.week')}
          value={
            <>
              {formatAverage(scale, avg, locale)}
              {w?.previous === 'marks' && avg != null && <ChangeArrow delta={w.delta} trend={w.trend} />}
            </>
          }
          tone={band ? BAND_TEXT[band] : 'text-ink3'}
          {...(w?.previous === 'marks' && w.prevAverage != null
            ? { hint: t('stat.was', { value: formatAverage(scale, w.prevAverage, locale) }) }
            : {})}
        />
        {attendance && (
          <Cell
            label={t('pick.absences')}
            value={card.absencesWeek ?? 0}
            tone={card.absencesWeek ? 'text-band-low-fg' : 'text-ink3'}
          />
        )}
      </>
    );
  } else {
    // the next school day: "tomorrow" when it is, otherwise its weekday (a Saturday shows Monday)
    const next = card.nextDay;
    const tz = summary?.timezone ?? 'UTC';
    const tomorrow = next && next.date === addDays(todayIn(tz), 1);
    const weekday = next
      ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(
          new Date(`${next.date}T12:00:00Z`),
        )
      : '';
    cells = (
      <>
        <Cell
          label={!next || tomorrow ? t('pick.lessonsTomorrow') : t('pick.lessonsOn', { day: weekday })}
          value={next?.lessons ?? 0}
          tone={next?.lessons ? 'text-ink' : 'text-ink3'}
        />
        <Cell label={t('pick.homework')} value={next?.homework ?? 0} tone="text-ink3" />
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full flex-col gap-3.5 rounded-lg bg-surface p-4 text-left shadow-card"
    >
      <div className="flex items-center gap-3.5">
        <Avatar traits={defaultTraits(card.grade)} index={index} size={56} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <b className="truncate text-[20px] tracking-[-0.01em]">{card.name}</b>
          <span className="truncate text-small text-ink3">
            {[card.classLabel, card.showSchool ? card.schoolLabel : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
      <div className="flex gap-2">{cells}</div>
      {card.now && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-bold text-accent">
          <ClockIcon size={14} />
          <span>{nowLineText(t, card.now)}</span>
        </div>
      )}
    </button>
  );
}
