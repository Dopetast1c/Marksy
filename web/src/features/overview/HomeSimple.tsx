import { shortDate } from '@marksy/core';
import { useNavigate } from 'react-router';
import { useOverview } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { MarkChip } from '../../components/MarkChip';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/Section';
import { SyncFooter } from '../../components/SyncFooter';
import { useCapabilities, useScale, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, useT } from '../../i18n';
import { todayIn } from '../../lib/time';
import { NextDay } from './NextDay';

// Главная in simple mode (docs/design.md 5.7, for the youngest): big, few, no analytics. Сегодня with today's marks as
// large chips; «Не забыть» (the tags due in the next 7 days) comes with tags (M6); the next school day's lessons, each
// with the large «готово» of simple mode (D41's exception); the sync line. No period control, no statistics, no
// trends, no advice. The same components as the full Главная, fewer of them.

export function HomeSimple({ studentId }: { studentId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const caps = useCapabilities(studentId);
  const tz = useSchoolTz(studentId);
  const today = todayIn(tz);
  // the period does not matter here: the last day and the next day are the same in every one
  const overview = useOverview(studentId, { period: 'week', offset: 0 });
  const o = overview.data;
  const marks = o?.lastDay?.date === today ? o.lastDay.marks : [];
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.home')} studentId={studentId} />
      <Body>
        {!o ? (
          <EmptyState title={overview.isError ? t('app.error') : t('app.loading')} />
        ) : (
          <div className="flex flex-col gap-3.5">
            {scale && (
              <section className="flex flex-col gap-2.5 rounded-lg bg-surface px-4 py-3.5 shadow-card">
                <SectionHeader title={t('day.today')} note={shortDate(today, dateStyle(), { weekday: true })} />
                {marks.length ? (
                  <div className="flex flex-wrap gap-2.5">
                    {marks.map((m) => (
                      <button
                        key={m.mark.id}
                        type="button"
                        onClick={() => navigate(`/s/${studentId}/subjects/${m.subject.id}`)}
                        className="flex min-w-[92px] flex-col items-center gap-1.5 rounded-md bg-surface2 px-3 py-2.5 text-[13px] font-bold"
                      >
                        <MarkChip mark={m.mark} large />
                        {m.subject.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-ink3">{t('home.simple.noMarks')}</span>
                )}
              </section>
            )}
            {o.nextDay && caps?.lessons && caps.futureTimetable && (
              <NextDay studentId={studentId} day={o.nextDay} tz={tz} />
            )}
            <SyncFooter studentId={studentId} />
          </div>
        )}
      </Body>
    </Frame>
  );
}
