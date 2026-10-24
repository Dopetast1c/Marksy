import { addDays, bandOf, formatAverage, shortDate } from '@marksy/core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { SubjectRowData } from '../../api/queries';
import { usePeriods, useSubjects } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import { ChangeArrow } from '../../components/ChangeArrow';
import { EmptyState } from '../../components/EmptyState';
import { FinalsEntry } from '../../components/FinalsEntry';
import { DownIcon } from '../../components/icons';
import { MarkChip } from '../../components/MarkChip';
import { MarkFilter, useMarkFilterFor } from '../../components/MarkFilter';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard } from '../../components/Section';
import { SubjectRow } from '../../components/SubjectRow';
import { useScale, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../../i18n';
import { forPeriod, roman } from '../../lib/period';
import { todayIn } from '../../lib/time';
import type { SubjectSort } from '../../state/store';
import { usePeriod, useSubjectSort } from '../../state/store';

// Предметы (docs/design.md 5.3a): the child's curriculum, every subject whatever the filter. The period control and the
// mark filter in the header, the navigator, the finals entry row, the order (a text button opening a sheet, D32), then
// one SubjectRow per subject: the last five marks of the filtered kind, the average in its band colour with the
// arrow and "было" (or «итог I: 8» while a term's finals are news). Subjects without marks in the period say so and
// sort last. A class without marks (D49) lists lessons, homework and the next lesson instead, by the next lesson.

const SORTS: readonly SubjectSort[] = ['alpha', 'weak', 'strong', 'fell', 'rose'];

const AVG_TEXT = {
  critical: 'text-band-critical-fg',
  low: 'text-band-low-fg',
  good: 'text-band-good-fg',
  top: 'text-band-top-fg-text',
} as const;

export function SubjectsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { studentId = '' } = useParams();
  const scale = useScale(studentId);
  const tz = useSchoolTz(studentId);
  const { kind, offset } = usePeriod();
  const { sort, setSort } = useSubjectSort();
  const filter = useMarkFilterFor(studentId);
  const list = useSubjects(studentId, { period: kind, offset }, filter.query, scale ? sort : 'alpha');
  const periods = usePeriods(studentId);
  const [sheet, setSheet] = useState(false);
  const locale = intlLocale();
  const ds = dateStyle();
  const today = todayIn(tz);
  const termKind = periods.data?.instances.term?.[0]?.termKind ?? null;
  const span = forPeriod(t, kind, termKind, locale);
  const open = (id: string) => navigate(`/s/${studentId}/subjects/${id}`);

  const marksRow = (r: SubjectRowData) => {
    const c = r.comparison;
    const avg = c?.current === 'marks' ? c.average : null;
    const band = scale && avg != null ? bandOf(scale, avg) : null;
    const was = r.final
      ? t('subjects.final', { term: roman(r.final.term.index), mark: r.final.raw })
      : c?.prevAverage != null && scale
        ? t('stat.was', { value: formatAverage(scale, c.prevAverage, locale) })
        : null;
    return (
      <SubjectRow
        key={r.subject.id}
        subject={r.subject}
        onClick={() => open(r.subject.id)}
        lines={
          r.last.length ? (
            <span className="flex gap-1">
              {[...r.last].reverse().map((m) => (
                <MarkChip key={m.id} mark={m} small />
              ))}
            </span>
          ) : (
            <span className="text-small text-ink3">
              {filter.comments
                ? t('subjects.noneFiltered', { filter: t('filter.comments.words'), span })
                : t('subjects.noMarks', { span })}
            </span>
          )
        }
        right={
          <span className="flex flex-none flex-col items-end gap-0.5">
            <span
              className={`min-w-11 text-right font-display text-[22px] leading-none font-semibold tabular-nums ${band ? AVG_TEXT[band] : 'text-ink3'}`}
            >
              {avg != null && scale ? formatAverage(scale, avg, locale) : '—'}
              {avg != null && c?.previous === 'marks' && <ChangeArrow delta={c.delta} trend={c.trend} />}
            </span>
            {was && <span className="text-[11.5px] font-semibold text-ink3 tabular-nums">{was}</span>}
          </span>
        }
      />
    );
  };

  const lessonsRow = (r: SubjectRowData) => {
    const l = r.lessons;
    const next = l?.next;
    const day = next
      ? next.date === today
        ? t('day.today').toLocaleLowerCase(locale)
        : next.date === addDays(today, 1)
          ? t('home.tomorrow').toLocaleLowerCase(locale)
          : shortDate(next.date, ds, { weekday: true })
      : null;
    return (
      <SubjectRow
        key={r.subject.id}
        subject={r.subject}
        onClick={() => open(r.subject.id)}
        lines={
          <>
            <span className="text-small text-ink3">
              {l?.count
                ? [
                    t('lessons.count', { count: l.count }),
                    l.homework ? t('subjects.homework', { count: l.homework }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : t('subjects.noLessons', { span })}
            </span>
            {offset === 0 && (
              <span className="text-small text-ink3">
                {next
                  ? t('subjects.next', {
                      when: next.slot != null ? t('subjects.nextSlot', { day, slot: next.slot }) : day,
                      homework: next.homework ? ` · ${next.homework}` : '',
                    })
                  : t('subjects.noneSoon')}
              </span>
            )}
          </>
        }
      />
    );
  };

  const rows = list.data?.subjects ?? [];
  let body: React.ReactNode;
  if (!list.data) body = <EmptyState title={list.isError ? t('app.error') : t('app.loading')} />;
  else if (!rows.length) body = <EmptyState title={t('subjects.empty')} />;
  else if (!scale)
    body = (
      <>
        <p className="m-0 rounded-md bg-surface2 px-3 py-2.5 text-[13px] text-ink2">
          {t(offset === 0 ? 'subjects.noMarksNote' : 'subjects.noMarksNotePast')}
        </p>
        <ListCard>{rows.map(lessonsRow)}</ListCard>
      </>
    );
  else
    body = (
      <>
        <div className="flex justify-end">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={t('subjects.sort.label')}
            onClick={() => setSheet(true)}
            className="flex min-h-9 items-center gap-1 px-0.5 text-[13px] font-bold text-accent"
          >
            {t(`subjects.sort.${sort}`)}
            <DownIcon size={14} />
          </button>
        </div>
        <ListCard>{rows.map(marksRow)}</ListCard>
        <p className="m-0 rounded-md bg-surface2 px-3 py-2.5 text-[13px] text-ink2">
          {t(`subjects.arrowNote.${termKind ?? 'other'}`)}
        </p>
        <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t('subjects.sort.label')}>
          <span className="text-label text-ink3 uppercase">{t('subjects.sort.label')}</span>
          {SORTS.map((s) => (
            <SheetOption
              key={s}
              title={t(`subjects.sort.${s}`)}
              sub={s === 'alpha' ? undefined : t(`subjects.sort.${s}.sub`)}
              selected={sort === s}
              onSelect={() => {
                setSort(s);
                setSheet(false);
              }}
            />
          ))}
          <span className="text-small text-ink3">{t('subjects.sort.note')}</span>
        </BottomSheet>
      </>
    );

  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.subjects')} studentId={studentId}>
        <PeriodBar studentId={studentId} />
        {scale && <MarkFilter studentId={studentId} />}
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} compare={!!scale} />
        {scale && <FinalsEntry studentId={studentId} />}
        <div className={`flex flex-col gap-3 transition-opacity ${list.isPlaceholderData ? 'opacity-50' : ''}`}>
          {body}
        </div>
      </Body>
    </Frame>
  );
}
