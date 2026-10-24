import { useNavigate } from 'react-router';
import type { ChildEvent } from '../api/queries';
import { useScale } from '../hooks/useStudent';
import { dateStyle, useT } from '../i18n';
import { eventText } from '../lib/events';
import type { Kind } from '../lib/period';
import { usePeriod } from '../state/store';
import { Row, Stripe } from './Section';

// One row of Внимание (docs/design.md 5.2a), on Главная and on the Внимание screen alike: the severity stripe, the
// fact in two lines, and a tap to where it belongs (the subject, the day in Расписание, Школа). «пришло в Telegram»
// joins the row with the inbox (M9).

export function EventRow({ studentId, event, termWord }: { studentId: string; event: ChildEvent; termWord: string }) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const kind = usePeriod((s) => s.kind) as Kind;
  const { title, sub } = eventText(t, event, { scale, ds: dateStyle(), kind, termWord });
  const go = () => {
    const l = event.link;
    if (l.screen === 'subject' && l.subjectId) navigate(`/s/${studentId}/subjects/${l.subjectId}`);
    else if (l.screen === 'schedule') navigate(`/s/${studentId}/schedule${l.date ? `?day=${l.date}` : ''}`);
    else navigate('/more');
  };
  return <Row stripe={<Stripe severity={event.severity} />} title={title} sub={sub} onClick={go} />;
}
