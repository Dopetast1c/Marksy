import { addDays, shortDate, weekdayOf } from '@marksy/core';
import { useNavigate } from 'react-router';
import type { Overview } from '../../api/queries';
import { useSchool } from '../../api/queries';
import { GapRow, LessonRow } from '../../components/LessonRow';
import { MoreButton, SectionHeader } from '../../components/Section';
import { dateStyle, useT } from '../../i18n';
import { todayIn } from '../../lib/time';

// The next school day on Главная (docs/design.md 5.2, ux-principles D33, D37): the same two-bar rows as Расписание in
// compact mode, missing slots as rows of their own («урока нет» before a late start, «окно» mid-day, with «ко 2-му,
// к 09:25» in the heading), the lesson count in the heading and «Всё расписание» under the list.

export function NextDay({
  studentId,
  day,
  tz,
}: {
  studentId: string;
  day: NonNullable<Overview['nextDay']>;
  tz: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const school = useSchool(studentId);
  const ds = dateStyle();
  const lessons = [...day.lessons].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  const held = lessons.filter((l) => !l.cancelled);
  const bells = school.data?.bells.find((b) => b.days.includes(weekdayOf(day.date))) ?? school.data?.bells[0];
  const bell = (slot: number) => bells?.periods.find((p) => p.slot === slot) ?? null;

  // the slots from 1 to the last lesson; a missing one before the first lesson is «урока нет», later an «окно»
  const slots = lessons.map((l) => l.slot).filter((s): s is number => s != null);
  const first = held.find((l) => l.slot != null);
  const rows: React.ReactNode[] = [];
  if (slots.length === lessons.length && slots.length) {
    const max = Math.max(...slots);
    for (let s = 1; s <= max; s++) {
      const here = lessons.filter((l) => l.slot === s);
      if (here.length)
        here.forEach((l) => rows.push(<LessonRow key={l.id} studentId={studentId} lesson={l} tz={tz} compact />));
      else {
        const b = bell(s);
        rows.push(
          <GapRow
            key={`gap-${s}`}
            slot={s}
            start={b?.start ?? null}
            end={b?.end ?? null}
            first={!first || s < first.slot!}
          />,
        );
      }
    }
  } else lessons.forEach((l) => rows.push(<LessonRow key={l.id} studentId={studentId} lesson={l} tz={tz} compact />));

  const tomorrow = day.date === addDays(todayIn(tz), 1);
  // short, so the lesson count and «ко 2-му, к 09:25» fit beside it on a 360 px phone: «Завтра, 22 окт», «пн, 26 окт»
  const title = tomorrow
    ? `${t('home.tomorrow')}, ${shortDate(day.date, ds)}`
    : shortDate(day.date, ds, { weekday: true });
  // «ко 2-му», «к 3-му»: the second lesson takes its own form in some languages
  const late =
    first && first.slot! > 1
      ? t('home.startsLater', {
          slot: first.slot,
          at: first.start ?? '',
          context: first.slot === 2 ? 'second' : undefined,
        })
      : null;
  return (
    <>
      <SectionHeader
        title={title}
        note={
          <>
            {t('lessons.count', { count: held.length })}
            {late && <b className="text-accent"> · {late}</b>}
          </>
        }
      />
      <div className="flex flex-col rounded-lg bg-surface py-1 pr-3.5 pl-2 shadow-card">{rows}</div>
      <MoreButton onClick={() => navigate(`/s/${studentId}/schedule`)}>{t('home.allSchedule')}</MoreButton>
    </>
  );
}
