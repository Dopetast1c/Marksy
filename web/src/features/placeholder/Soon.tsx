import { useParams } from 'react-router';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';

// A child screen of a later milestone (Оценки, Предметы M5b, Расписание M5c): the tab exists from the start, so the
// tab bar never changes (D53), and the screen says it is coming.

export function SoonScreen({ screen }: { screen: 'marks' | 'subjects' | 'schedule' }) {
  const t = useT();
  const { studentId = '' } = useParams();
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t(`screen.${screen}`)} studentId={studentId} />
      <Body>
        <EmptyState title={t('app.soon.title')} text={t('app.soon.text')} />
      </Body>
    </Frame>
  );
}
