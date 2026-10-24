import { useParams } from 'react-router';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';

// Главная (docs/design.md 5.2). Session A: the shell only (header, period kind, navigator with swipe); the blocks
// follow in session C.

export function HomeScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.home')} studentId={studentId}>
        <PeriodBar studentId={studentId} />
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} compare />
        <EmptyState title={t('app.soon.title')} text={t('app.soon.text')} />
      </Body>
    </Frame>
  );
}
