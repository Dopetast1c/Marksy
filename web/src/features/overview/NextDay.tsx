import { addDays, shortDate } from '@marksy/core';
import { useNavigate } from 'react-router';
import type { Overview } from '../../api/queries';
import { useSchool } from '../../api/queries';
import { DayLessons } from '../../components/LessonRow';
import { MoreButton, SectionHeader } from '../../components/Section';
import { dateStyle, useT } from '../../i18n';
import { todayIn } from '../../lib/time';

// The next school day on Home (tabs.home; docs/design.md 5.2, ux-principles D33, D37): the same two-bar rows as
// Timetable (screen.schedule) in compact mode, with the ⋯ menu, missing slots as rows of their own ("no lesson"
// lesson.noLesson before a late start, "free period" lesson.window mid-day, with "from lesson 2, at 09:25"
// home.startsLater in the heading), the lesson count in the heading and "Whole timetable" (home.allSchedule) under the
// list, which opens Day (schedule.day) on this day.

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
  // short, so the lesson count and "from lesson 2, at 09:25" fit beside it on a 360 px phone: "Tomorrow, 22 Oct",
  // "Mon, 26 Oct"
  const title = tomorrow
    ? `${t('home.tomorrow')}, ${shortDate(day.date, ds)}`
    : shortDate(day.date, ds, { weekday: true });
  // home.startsLater and its _second form: the second lesson takes its own wording in some languages (Russian)
  const late =
    first && first.slot! > 1
      ? t(first.start ? 'home.startsLater' : 'home.startsLaterNoTime', {
          slot: first.slot,
          at: first.start,
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
