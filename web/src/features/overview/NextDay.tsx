import { addDays, shortDate } from '@marksy/core';
import { useNavigate } from 'react-router';
import type { Overview } from '../../api/queries';
import { useSchool } from '../../api/queries';
import { DayLessons } from '../../components/LessonRow';
import { MoreButton, SectionHeader } from '../../components/Section';
import { dateStyle, useT } from '../../i18n';
import { todayIn } from '../../lib/time';

// The next school day on Главная (docs/design.md 5.2, ux-principles D33, D37): the same two-bar rows as Расписание in
// compact mode, with the ⋯ menu, missing slots as rows of their own («урока нет» before a late start, «окно» mid-day,
// with «ко 2-му, к 09:25» in the heading), the lesson count in the heading and «Всё расписание» under the list, which
// opens День on this day.

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
  const held = day.lessons.filter((l) => !l.cancelled);
  const first = [...held].filter((l) => l.slot != null).sort((a, b) => a.slot! - b.slot!)[0];

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
      <DayLessons
        studentId={studentId}
        date={day.date}
        lessons={day.lessons}
        tz={tz}
        bells={school.data?.bells}
        compact
      />
      <MoreButton onClick={() => navigate(`/s/${studentId}/schedule?day=${day.date}`)}>
        {t('home.allSchedule')}
      </MoreButton>
    </>
  );
}
