import { shortDate } from '@marksy/core';
import { useNavigate, useParams } from 'react-router';
import { useMe, usePeriods, useOverview, useTrend } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { DistCard } from '../../components/DistCard';
import { EmptyState } from '../../components/EmptyState';
import { EventRow } from '../../components/EventRow';
import { MarkChip } from '../../components/MarkChip';
import { NowCard } from '../../components/NowCard';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard, MoreButton, Row, SectionHeader, Stripe } from '../../components/Section';
import { BandCard, LessonTiles, StatTiles } from '../../components/StatBlock';
import { SyncFooter } from '../../components/SyncFooter';
import { TrendCard } from '../../components/TrendCard';
import { useCapabilities, useScale, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, useT } from '../../i18n';
import { subjectStyle } from '../../lib/subject-color';
import { todayIn } from '../../lib/time';
import { usePeriod } from '../../state/store';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { HomeSimple } from './HomeSimple';
import { NearGoals } from './NearGoals';
import { NextDay } from './NextDay';

// Главная (docs/design.md 5.2, ux-principles D30, D31, D52): «Сейчас» above the navigator during the school day; the
// brief row (average and count, or lessons and homework in a class without marks, D49); the last school day's marks
// (five, then «Все оценки»); Внимание (five, then «Показать все»); the next school day in brief; Статистика (bands,
// Распределение, Динамика) at the bottom; the sync line. A student gets «Близко к цели» after Внимание (5.7). «Занятия
// сегодня» comes with M7.

const FIVE = 5;

export function HomeScreen() {
  const { studentId = '' } = useParams();
  // simple mode (5.7) has a Главная of its own
  return useSimpleMode() ? <HomeSimple studentId={studentId} /> : <HomeFull studentId={studentId} />;
}

function HomeFull({ studentId }: { studentId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const caps = useCapabilities(studentId);
  const tz = useSchoolTz(studentId);
  const { kind, offset } = usePeriod();
  const q = { period: kind, offset };
  const overview = useOverview(studentId, q);
  const trend = useTrend(studentId, q);
  const periods = usePeriods(studentId);
  const termKind = periods.data?.instances.term?.[0]?.termKind ?? 'other';
  const termWord = t(`term.${termKind}`);
  const o = overview.data;
  const ds = dateStyle();
  const student = useMe().data?.family?.role === 'student';

  let body: React.ReactNode;
  if (!o) body = <EmptyState title={overview.isError ? t('app.error') : t('app.loading')} />;
  else {
    const last = o.lastDay;
    const lastRows = last ? [...last.marks].reverse().slice(0, FIVE) : [];
    const lastIsToday = last?.date === todayIn(tz);
    body = (
      <>
        {scale ? (
          <StatTiles scale={scale} comparison={o.comparison} count={o.marksCount} prevCount={o.prevMarksCount} />
        ) : (
          o.lessonTiles && <LessonTiles tiles={o.lessonTiles} />
        )}

        {scale && last && (
          <>
            <SectionHeader
              title={lastIsToday ? t('home.marksToday') : t('home.lastMarks')}
              note={[
                last.marks.length > FIVE ? t('home.fiveOf', { count: last.marks.length }) : null,
                shortDate(last.date, ds, { weekday: true }),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <ListCard>
              {lastRows.map((m) => (
                <Row
                  key={m.mark.id}
                  stripe={<Stripe subject={subjectStyle(m.subject.name, m.subject.color)} />}
                  lead={<MarkChip mark={m.mark} />}
                  title={m.subject.name}
                  sub={[m.workType ? t(`workType.${m.workType}`) : null, m.comment].filter(Boolean).join(' · ') || null}
                  subIsData
                  onClick={() => navigate(`/s/${studentId}/subjects/${m.subject.id}`)}
                />
              ))}
            </ListCard>
            {last.marks.length > FIVE && (
              <MoreButton onClick={() => navigate(`/s/${studentId}/marks`)}>
                {t('home.allMarks', { count: last.marks.length })}
              </MoreButton>
            )}
          </>
        )}

        <SectionHeader
          title={t('screen.events')}
          note={
            o.attentionTotal > FIVE
              ? t('home.fiveOf', { count: o.attentionTotal })
              : o.attentionTotal
                ? t('events.count', { count: o.attentionTotal })
                : ''
          }
        />
        <ListCard>
          {o.attention.length ? (
            o.attention.map((e, i) => (
              <EventRow key={`${e.kind}-${e.date}-${i}`} studentId={studentId} event={e} termWord={termWord} />
            ))
          ) : (
            <EmptyState title={t('events.calm')} />
          )}
        </ListCard>
        {o.attentionTotal > FIVE && (
          <MoreButton onClick={() => navigate(`/s/${studentId}/events`)}>
            {t('home.showAll', { count: o.attentionTotal })}
          </MoreButton>
        )}

        {student && scale && o.nearGoals && <NearGoals studentId={studentId} rows={o.nearGoals} scale={scale} />}

        {o.nextDay && caps?.lessons && caps.futureTimetable && (
          <NextDay studentId={studentId} day={o.nextDay} tz={tz} />
        )}

        {scale && (
          <>
            <SectionHeader title={t('home.stats')} />
            <BandCard
              scale={scale}
              bands={o.bands}
              comparison={o.comparison}
              absences={o.absences}
              prevAbsences={o.prevAbsences}
            />
            <DistCard scale={scale} buckets={o.distribution} />
            {trend.data && <TrendCard scale={scale} kind={kind} buckets={trend.data.buckets} termKind={termKind} />}
          </>
        )}
        <SyncFooter studentId={studentId} />
      </>
    );
  }

  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.home')} studentId={studentId}>
        <PeriodBar studentId={studentId} />
      </ScreenHeader>
      <Body>
        {o?.now && <NowCard studentId={studentId} now={o.now} tz={tz} />}
        <PeriodNav studentId={studentId} compare />
        {/* the previous period stays on screen while the next one loads, dimmed so it is not read as the new one */}
        <div className={`flex flex-col gap-3.5 transition-opacity ${overview.isPlaceholderData ? 'opacity-50' : ''}`}>
          {body}
        </div>
      </Body>
    </Frame>
  );
}
