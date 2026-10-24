import { formatAverage, shortDate } from '@marksy/core';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { SubjectDetail } from '../../api/queries';
import { usePeriods, useSubject, useSubjectTrend } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { DistCard } from '../../components/DistCard';
import { EmptyState } from '../../components/EmptyState';
import { FinalCellView } from '../../components/FinalCell';
import { AttentionCard, HintRow } from '../../components/HintRow';
import { CommentIcon } from '../../components/icons';
import { LessonRow } from '../../components/LessonRow';
import { MarkChip } from '../../components/MarkChip';
import { MarkFilter, useMarkFilterFor } from '../../components/MarkFilter';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard, SectionHeader } from '../../components/Section';
import { BandCard, LessonTiles, StatTiles } from '../../components/StatBlock';
import { TrendCard } from '../../components/TrendCard';
import { useCapabilities, useScale, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../../i18n';
import { schoolYearLabel } from '../../lib/finals';
import { goalText, hintText } from '../../lib/hints';
import { forPeriod, roman } from '../../lib/period';
import { subjectStyle } from '../../lib/subject-color';
import { usePeriod } from '../../state/store';
import { SubjectSettings } from './SubjectSettings';

// Предмет (docs/design.md 5.4, ux-principles D45): the header and the navigator on a tint of the subject colour, the
// screen's own controls in it; statistics, charts and mark chips never take it. First what does not depend on the
// period: «Настройки предмета», «О предмете», «Обратить внимание» (the goal row and the hints, gone with guidance off).
// Then what follows the period and the filter: StatBlock, Распределение, Динамика, the marks and the teacher's comments
// of the period. Then «Ближайшие уроки», and under the «Четверть» divider the term strip, which follows neither.
// A class without marks (D49): the colour only, the tiles Уроков and Заданий, the coming lessons.

const SEVERITY = { critical: 'critical', low: 'low', ok: 'neutral', good: 'good' } as const;

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center gap-3 text-[13px] font-extrabold tracking-[.06em] text-ink3 uppercase before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {children}
    </div>
  );
}

function About({ d, hasMarks }: { d: SubjectDetail; hasMarks: boolean }) {
  const t = useT();
  const locale = intlLocale();
  const s = d.subject;
  const rows: [string, ReactNode][] = [];
  if (s.teacherName) rows.push([t('subject.about.teacher'), s.teacherName]);
  if (s.groupLabel) rows.push([t('subject.about.group'), s.groupLabel]);
  if (hasMarks) rows.push([t('subject.about.level'), s.levelLabel ?? t(`subject.level.${s.level ?? 'regular'}`)]);
  if (d.week.length) {
    rows.push([t('subject.about.perWeek'), t('lessons.count', { count: d.week.length })]);
    // weekday 0 is Sunday (core's weekdayOf); 2024-01-07 was a Sunday
    const day = (w: number) =>
      new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(
        new Date(Date.UTC(2024, 0, 7 + w, 12)),
      );
    rows.push([
      t('subject.about.when'),
      <span key="when" className="flex flex-col">
        {d.week.map((w) => (
          <span key={`${w.weekday}-${w.slot}`}>
            {[
              `${day(w.weekday)} ${t('subject.about.slot', { slot: w.slot })}`,
              w.room ? t('lesson.room', { room: w.room }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ))}
      </span>,
    ]);
  }
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-[7px] rounded-lg bg-surface px-4 py-3.5 shadow-card">
      <span className="text-label text-ink3 uppercase">{t('subject.about.title')}</span>
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[96px_1fr] gap-2.5 text-[13.5px] leading-[1.35]">
          <span className="text-ink3">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </section>
  );
}

export function SubjectScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { studentId = '', subjectId = '' } = useParams();
  const scale = useScale(studentId);
  const caps = useCapabilities(studentId);
  const tz = useSchoolTz(studentId);
  const { kind, offset } = usePeriod();
  const filter = useMarkFilterFor(studentId);
  const q = { period: kind, offset };
  const subject = useSubject(studentId, subjectId, q, filter.query);
  const trend = useSubjectTrend(studentId, subjectId, q, filter.query);
  const periods = usePeriods(studentId);
  const locale = intlLocale();
  const ds = dateStyle();
  const d = subject.data;
  const termKind = periods.data?.instances.term?.[0]?.termKind ?? 'other';
  const accent = d ? subjectStyle(d.subject.name, d.subject.color) : undefined;

  let body: ReactNode;
  if (!d) body = <EmptyState title={subject.isError ? t('app.error') : t('app.loading')} />;
  else {
    const goal = d.attention.goal && scale ? goalText(t, d.attention.goal, scale, locale) : null;
    const hints = scale ? d.attention.hints : [];
    const upcoming = d.upcoming.length ? (
      <section className="flex flex-col gap-2">
        <SectionHeader title={t('subject.upcoming')} />
        {d.upcoming.map((l) => {
          const day = shortDate(l.date, ds, { weekday: true });
          return (
            <Fragment key={l.id}>
              <span className="mt-0.5 text-[13px] font-extrabold text-ink2">
                {day.charAt(0).toLocaleUpperCase(locale) + day.slice(1)}
              </span>
              <div className="rounded-lg bg-surface px-4 shadow-card">
                <LessonRow studentId={studentId} lesson={l} tz={tz} compact />
              </div>
            </Fragment>
          );
        })}
      </section>
    ) : null;
    const settings = (
      <div className="subject-accent flex flex-col gap-3.5" style={accent}>
        <SubjectSettings
          studentId={studentId}
          subject={d.subject}
          settings={d.settings}
          scale={scale}
          termKind={termKind}
        />
        <About d={d} hasMarks={!!scale} />
        {(goal || hints.length > 0) && (
          <AttentionCard title={t('subject.attention')}>
            {goal && <HintRow severity={goal.tone} title={goal.title} sub={goal.sub} />}
            {scale &&
              hints.map((h) => (
                <HintRow
                  key={`${h.rule}-${h.date ?? ''}`}
                  severity={SEVERITY[h.severity]}
                  title={hintText(t, h.fact, scale, ds)}
                  sub={h.advice ? hintText(t, h.advice, scale, ds) : null}
                />
              ))}
          </AttentionCard>
        )}
      </div>
    );

    if (!scale)
      body = (
        <>
          {settings}
          {d.lessonTiles && <LessonTiles tiles={d.lessonTiles} />}
          {upcoming ?? (caps?.lessons && caps.futureTimetable && <EmptyState title={t('subject.noneSoon')} />)}
        </>
      );
    else {
      const items = d.timeline.filter((i) => i.type === 'mark' || i.type === 'comment');
      const span = forPeriod(t, kind, termKind, locale);
      const term = d.terms.find((x) => x.from <= (periods.data?.today ?? '') && (periods.data?.today ?? '') <= x.to);
      const termFinal = term?.cell.kind === 'final' ? term.cell : null;
      body = (
        <>
          {settings}
          <StatTiles scale={scale} comparison={d.comparison} count={d.count} prevCount={d.prevCount} />
          <BandCard scale={scale} bands={d.bands} comparison={d.comparison} absences={null} prevAbsences={null} />
          <DistCard scale={scale} buckets={d.distribution} />
          {trend.data && <TrendCard scale={scale} kind={kind} buckets={trend.data.buckets} termKind={termKind} />}
          <SectionHeader title={t('subject.marks')} note={`${d.count} · ${span}`} />
          <ListCard>
            {items.length ? (
              items.map((i) =>
                i.type === 'mark' ? (
                  <div key={i.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                    <MarkChip mark={i.mark} />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="font-bold">
                        {i.workType ? t(`workType.${i.workType}`) : shortDate(i.date, ds, { weekday: true })}
                      </span>
                      {(i.workType || i.topic) && (
                        <span className="text-small text-ink3">
                          {[i.workType ? shortDate(i.date, ds, { weekday: true }) : null, i.topic]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      {i.comment && (
                        <span className="flex items-start gap-1.5 text-small text-ink2">
                          <CommentIcon size={14} className="mt-0.5 flex-none text-ink3" />
                          {i.comment}
                        </span>
                      )}
                    </span>
                  </div>
                ) : i.type === 'comment' ? (
                  <div key={i.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                    <span className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-surface2 text-ink2">
                      <CommentIcon size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="font-bold">{t('marks.comment')}</span>
                      <span className="text-small text-ink2">
                        {shortDate(i.date, ds, { weekday: true })} · {t('event.quote', { text: i.text ?? '' })}
                      </span>
                    </span>
                  </div>
                ) : null,
              )
            ) : (
              <EmptyState
                title={t('subject.noMarks')}
                text={filter.on ? t('subject.noMarks.filtered') : t('subject.noMarks.period')}
              />
            )}
          </ListCard>
          {upcoming}
          {d.terms.length > 0 && (
            <>
              <Divider>{t(`term.${termKind}`)}</Divider>
              <p className="-mt-1.5 text-small text-ink3">{t(`subject.termNote.${termKind}`)}</p>
              <section className="flex flex-col gap-2.5 rounded-lg bg-surface px-4 py-3.5 shadow-card">
                <SectionHeader
                  title={t(`subject.byTerms.${termKind}`)}
                  note={
                    // «новый предмет» only when Marksy has last year and the subject was not in it
                    d.lastYear
                      ? d.lastYear.raw
                        ? t('subject.lastYear', { year: schoolYearLabel(d.lastYear.label), mark: d.lastYear.raw })
                        : t('subject.newThisYear')
                      : undefined
                  }
                />
                {/* the strip opens Итоги (5.3b) */}
                <button
                  type="button"
                  aria-label={t('finals.all')}
                  onClick={() => navigate(`/s/${studentId}/finals`)}
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${d.terms.length + (d.year ? 1 : 0)}, minmax(0, 1fr))` }}
                >
                  {d.terms.map((x) => (
                    <span key={x.id} className="flex flex-col items-center gap-1">
                      <span className="text-label text-ink3">{roman(x.index)}</span>
                      <FinalCellView cell={x.cell} scale={scale} locale={locale} />
                    </span>
                  ))}
                  {d.year && (
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-label text-ink3 uppercase">{t('finals.year')}</span>
                      <FinalCellView cell={d.year} scale={scale} locale={locale} />
                    </span>
                  )}
                </button>
                {caps?.finalMarks && term && (
                  <span className="text-small text-ink3">
                    {termFinal
                      ? t(`subject.termPosted.${termKind}`, {
                          roman: roman(term.index),
                          mark: termFinal.raw ?? '',
                          average: term.average != null ? formatAverage(scale, term.average, locale) : '—',
                        })
                      : t(`subject.termRunning.${termKind}`, { date: shortDate(term.to, ds) })}
                  </span>
                )}
              </section>
            </>
          )}
        </>
      );
    }
  }

  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={d?.subject.name ?? ''} studentId={studentId} back accent={accent}>
        <PeriodBar studentId={studentId} />
        {scale && <MarkFilter studentId={studentId} />}
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} accent={accent} compare={!!scale} />
        <div className={`flex flex-col gap-3.5 transition-opacity ${subject.isPlaceholderData ? 'opacity-50' : ''}`}>
          {body}
        </div>
      </Body>
    </Frame>
  );
}
