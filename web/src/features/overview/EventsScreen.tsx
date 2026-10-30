import { useParams } from 'react-router';
import { useEvents, usePeriods } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { EventRow } from '../../components/EventRow';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard } from '../../components/Section';
import { useT } from '../../i18n';
import { usePeriod } from '../../state/store';

// Attention (screen.events; docs/design.md 5.2a, ux-principles D29), reached from "Show all" (home.showAll) on Home
// (tabs.home): the same rows, all of them, ranked by severity then date, with the same period control, navigator and swipe; no second caption (the
// navigator names the period). Rows about the future appear only in the current instance, which the note says.

export function EventsScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  const { kind, offset } = usePeriod();
  const events = useEvents(studentId, { period: kind, offset });
  const periods = usePeriods(studentId);
  const termWord = t(`term.${periods.data?.instances.term?.[0]?.termKind ?? 'other'}`);
  const items = events.data?.items ?? [];
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.events')} studentId={studentId} back>
        <PeriodBar studentId={studentId} />
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} />
        {events.data ? (
          <ListCard>
            {items.length ? (
              items.map((e, i) => (
                <EventRow key={`${e.kind}-${e.date}-${i}`} studentId={studentId} event={e} termWord={termWord} />
              ))
            ) : (
              <EmptyState title={t('events.calm')} text={t('events.calm.text')} />
            )}
          </ListCard>
        ) : (
          <EmptyState title={events.isError ? t('app.error') : t('app.loading')} />
        )}
        <p className="text-small text-ink3">{t('events.note')}</p>
      </Body>
    </Frame>
  );
}
