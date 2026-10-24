import { addDays } from '@marksy/core';
import { useNavigate } from 'react-router';
import type { Overview } from '../api/queries';
import { intlLocale, useT } from '../i18n';
import { subjectStyle } from '../lib/subject-color';
import { todayIn } from '../lib/time';
import { ChevIcon } from './icons';
import { Stripe } from './Section';

// «Сейчас» (docs/design.md 5.2, ux-principles D52): the one card above the period navigator, during the child's school
// day only (the API sends nothing outside it). One line in caps and two lines of content with the subject's colour
// stripe; a tap opens Расписание on today. Needs times (bells or the diary's); without them there is no card.

export function NowCard({ studentId, now, tz }: { studentId: string; now: NonNullable<Overview['now']>; tz: string }) {
  const t = useT();
  const navigate = useNavigate();
  const where = (room: string | null) => (room ? t('lesson.room', { room }) : null);
  let head: string;
  let main: string;
  let sub: string | null;
  let subject: string | null = null;
  switch (now.state) {
    case 'lesson':
      head = now.slot != null ? t('nowCard.lesson', { slot: now.slot }) : t('nowCard.lessonNoSlot');
      main = now.subjectName;
      sub = [where(now.room), t('nowCard.until', { at: now.until })].filter(Boolean).join(' · ');
      subject = now.subjectName;
      break;
    case 'break':
      head = t('nowCard.break');
      main = t('nowCard.until', { at: now.at });
      sub = t('nowCard.next', {
        lesson: [now.slot != null ? `${now.slot}. ${now.subjectName}` : now.subjectName, where(now.room)]
          .filter(Boolean)
          .join(' · '),
      });
      subject = now.subjectName;
      break;
    case 'before':
      head = t('nowCard.before');
      main = t('nowCard.firstAt', { at: now.at });
      sub = [now.slot != null ? `${now.slot}. ${now.subjectName}` : now.subjectName, where(now.room)]
        .filter(Boolean)
        .join(' · ');
      subject = now.subjectName;
      break;
    case 'done':
      head = t('nowCard.done');
      main = t('nowCard.at', { at: now.at });
      sub = now.next
        ? now.next.date === addDays(todayIn(tz), 1)
          ? t('nowCard.tomorrowAt', { at: now.next.at })
          : t('nowCard.dayAt', {
              day: new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', weekday: 'short' }).format(
                new Date(`${now.next.date}T12:00:00Z`),
              ),
              at: now.next.at,
            })
        : null;
      break;
  }
  return (
    <button
      type="button"
      onClick={() => navigate(`/s/${studentId}/schedule?day=${todayIn(tz)}`)}
      className="flex w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-3 text-left shadow-card"
    >
      {subject ? <Stripe subject={subjectStyle(subject)} /> : <Stripe severity="neutral" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11.5px] font-extrabold tracking-[0.05em] text-accent uppercase">{head}</span>
        <b className="truncate text-[16.5px]">{main}</b>
        {sub && <span className="truncate text-small text-ink2">{sub}</span>}
      </span>
      <ChevIcon className="flex-none text-ink3" />
    </button>
  );
}
