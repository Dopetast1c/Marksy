import { useParams } from 'react-router';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';

// Внимание (docs/design.md 5.2a), reached from «Показать все» on Главная. Session A: the shell; the list follows in
// session C.

export function EventsScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.events')} studentId={studentId} back>
        <PeriodBar studentId={studentId} />
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} />
        <EmptyState title={t('app.soon.title')} text={t('app.soon.text')} />
      </Body>
    </Frame>
  );
}
