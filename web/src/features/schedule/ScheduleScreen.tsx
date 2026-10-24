import { addDays, daysBetween, lessonPassed, shortDate, shortRange, weekdayOf, weekStartOf } from '@marksy/core';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { Schedule, ScheduleLesson } from '../../api/queries';
import { useSchedule, useScheduleDays, useSchool } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { AttentionCard, HintRow } from '../../components/HintRow';
import { SchoolIcon, SunIcon } from '../../components/icons';
import { DayLessons, TagNoteIcon } from '../../components/LessonRow';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import type { NavModel } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useClock } from '../../hooks/useClock';
import { useCapabilities, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../../i18n';
import type { TFunction } from 'i18next';
import { dayCaption } from '../../lib/days';
import { todayIn } from '../../lib/time';
import { useScheduleView } from '../../state/store';
import type { ScheduleKind } from '../../state/store';

// Расписание (docs/design.md 5.5, ux-principles D2, D33 to D41): the same two period controls as everywhere, with the
// kinds День / Неделя and a navigator that also goes forward: a day steps over days without lessons, a week by
// calendar weeks while the diary has lessons in them (or holidays). «Обратить внимание» covers exactly the selected
// range (the lessons still ahead that carry a tag; hidden without one): in День under the line of counts, in Неделя
// above the days. Then «Ко 2-му уроку» and the lessons as one two-bar list with gaps (DayLessons). Неделя shows every
// school day of the manifest's calendar (and any other day with lessons); a day in the child's holidays is a holiday
// card, a week whose school days are all holidays is one card.

type Holiday = { from: string; to: string; note: string | null };
const holidayOn = (hs: readonly Holiday[] | undefined, d: string) => hs?.find((h) => h.from <= d && d <= h.to) ?? null;

function HolidayCard({ h }: { h: Holiday }) {
  const t = useT();
  const ds = dateStyle();
  const n = daysBetween(h.from, h.to) + 1;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg bg-holiday-bg px-4 py-6 text-center text-holiday-fg">
      <SunIcon size={28} />
      <b className="text-h2">{t('schedule.holidays')}</b>
      <span className="text-[14px]">
        {shortRange(h.from, h.to, ds)} · {t('days.count', { count: n })}
      </span>
    </div>
  );
}

/** «08:00–13:35 · 6 уроков · 1 не будет, 4 д/з · готово 2 из 5, 1 контрольная»: only lessons that take place count */
function dayCounts(t: TFunction, lessons: readonly ScheduleLesson[], now: Date, tz: string) {
  const held = lessons.filter((l) => !l.cancelled);
  const timed = held.filter((l) => l.start && l.end);
  const ahead = held.filter((l) => !lessonPassed(l, now, tz));
  const ready = ahead.filter((l) => l.ready).length;
  const homework = held.filter((l) => l.homework || l.ownHomework.length).length;
  const tests = held.filter((l) => l.isTest).length;
  const cancelled = lessons.length - held.length;
  const span = timed.length ? `${timed[0]!.start}–${timed.at(-1)!.end} · ` : '';
  const main = [
    t('lessons.count', { count: held.length }),
    cancelled ? t('schedule.cancelled', { count: cancelled }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      {span}
      {main}
      {homework > 0 && `, ${t('schedule.homework', { count: homework })}`}
      {ahead.length > 0 && (
        <>
          {' · '}
          <b className="whitespace-nowrap text-band-good-fg">
            {t('schedule.ready', { done: ready, total: ahead.length })}
          </b>
        </>
      )}
      {tests > 0 && (
        <>
          {', '}
          <b className="whitespace-nowrap text-band-low-fg">{t('schedule.tests', { count: tests })}</b>
        </>
      )}
    </>
  );
}

/** «Обратить внимание» (5.5, D43): facts from tags only, about the selected range, «Тег · Предмет» / when / the words */
function Attention({ studentId, items, today }: { studentId: string; items: Schedule['attention']; today: string }) {
  const t = useT();
  const navigate = useNavigate();
  const ds = dateStyle();
  if (!items.length) return null;
  return (
    <AttentionCard title={t('subject.attention')}>
      {items.map((a) => {
        const n = daysBetween(today, a.date);
        const day =
          n === 0
            ? t('day.today').toLocaleLowerCase(ds.locale)
            : n === 1
              ? t('home.tomorrow').toLocaleLowerCase(ds.locale)
              : shortDate(a.date, ds, { weekday: true });
        const when = [
          a.slot != null ? t('schedule.attentionWhen', { day, slot: a.slot }) : day,
          n > 1 ? t('schedule.attentionIn', { count: n }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const words = !a.snippet
          ? null
          : a.field === 'homework' && a.setOn
            ? t('schedule.attentionHomework', { date: shortDate(a.setOn, ds, { weekday: true }), text: a.snippet })
            : a.field === 'topic'
              ? t('schedule.attentionTopic', { text: a.snippet })
              : a.snippet;
        return (
          <button
            key={`${a.tag.id}-${a.lessonId}`}
            type="button"
            className="text-left"
            onClick={() => navigate(`/s/${studentId}/subjects/${a.subject.id}`)}
          >
            <HintRow
              severity={a.tag.tone === 'important' ? 'low' : 'neutral'}
              icon={<TagNoteIcon name={a.tag.icon} size={15} />}
              title={`${a.tag.name} · ${a.subject.name}`}
              sub={when}
              note={words}
            />
          </button>
        );
      })}
    </AttentionCard>
  );
}

export function ScheduleScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  const tz = useSchoolTz(studentId);
  const caps = useCapabilities(studentId);
  const ds = dateStyle();
  const locale = intlLocale();
  const now = useClock();
  const view = useScheduleView();
  // a link with ?day= (Главная's «Всё расписание», «Сейчас», a teacher's comment, Внимание) opens День on that day
  const [search, setSearch] = useSearchParams();
  const linked = search.get('day');
  const { showDay } = view;
  useEffect(() => {
    if (!linked || !/^\d{4}-\d{2}-\d{2}$/.test(linked)) return;
    showDay(linked);
    setSearch({}, { replace: true });
  }, [linked, showDay, setSearch]);
  const days = useScheduleDays(studentId);
  const school = useSchool(studentId);
  const today = days.data?.today ?? todayIn(tz);
  const weekStart = days.data?.weekStart ?? 1;
  const schoolDays = days.data?.schoolDays ?? [];
  const holidays = school.data?.holidays;
  const lessonDays = useMemo(() => days.data?.days ?? [], [days.data]);
  // День opens on today; on a day without lessons (a weekend, the holidays) on the next day with lessons, like
  // «Всё расписание» on Главная (5.5)
  const day =
    view.day ??
    (lessonDays.some((d) => d.date === today) ? today : (lessonDays.find((d) => d.date > today)?.date ?? today));
  const monday = (w: number) => addDays(weekStartOf(today, weekStart), 7 * w);
  /** the holidays a whole week sits in: every school day of it (manifest.calendar) is a holiday */
  const holidayWeek = (w: number) => {
    const week = Array.from({ length: 7 }, (_, i) => addDays(monday(w), i)).filter((d) =>
      schoolDays.includes(weekdayOf(d)),
    );
    const hs = week.map((d) => holidayOn(holidays, d));
    return week.length && hs.every(Boolean) ? hs[0]! : null;
  };
  const schedule = useSchedule(studentId, view.kind === 'day' ? { day } : { week: view.week });

  const kindModel = {
    label: t('schedule.kind'),
    value: view.kind,
    options: [
      { value: 'day', label: t('schedule.day') },
      { value: 'week', label: t('period.week') },
    ],
    // День keeps the day in view: the week that holds it; a week back to День opens today when it is this week
    onChange: (k: string) => {
      if ((k as ScheduleKind) === 'week')
        view.showWeek(Math.round(daysBetween(weekStartOf(today, weekStart), weekStartOf(day, weekStart)) / 7));
      else {
        const from = monday(view.week);
        const first = lessonDays.find((d) => d.date >= from && d.date <= addDays(from, 6));
        view.showDay(view.week === 0 || !first ? null : first.date);
      }
    },
  };

  let nav: NavModel | null = null;
  if (days.data) {
    if (view.kind === 'day') {
      const older = [...lessonDays].reverse().find((d) => d.date < day);
      const newer = lessonDays.find((d) => d.date > day);
      const caption = dayCaption(t, day, today, ds);
      const near = lessonDays.filter((d) => d.date >= addDays(today, -7) && d.date <= addDays(today, 14));
      nav = {
        title: caption.label,
        sub: caption.date,
        olderOk: !!older,
        newerOk: !!newer,
        step: (delta) => {
          const to = delta === 1 ? older : newer;
          if (to) view.showDay(to.date);
        },
        sheet: {
          label: t('schedule.pickDay'),
          options: near.map((d) => {
            const c = dayCaption(t, d.date, today, ds);
            return {
              key: d.date,
              title: c.label,
              sub: c.date,
              value: t('lessons.count', { count: d.held }),
              selected: d.date === day,
              onSelect: () => view.showDay(d.date),
            };
          }),
        },
      };
    } else {
      const weekTitle = (w: number) =>
        w === 0
          ? t('period.thisWeek')
          : w === 1
            ? t('schedule.nextWeek')
            : w === -1
              ? t('period.lastWeek')
              : w > 1
                ? t('schedule.weeksAhead', { count: w })
                : t('schedule.weeksAgo', { count: -w });
      const count = (w: number) =>
        lessonDays
          .filter((d) => d.date >= monday(w) && d.date <= addDays(monday(w), 6))
          .reduce((n, d) => n + d.held, 0);
      const reachable = (w: number) =>
        lessonDays.some((d) => d.date >= monday(w) && d.date <= addDays(monday(w), 6)) || !!holidayWeek(w);
      const range: number[] = [];
      for (let w = -3; w <= 2; w++) if (count(w) > 0 || w === view.week) range.push(w);
      nav = {
        title: weekTitle(view.week),
        sub: shortRange(monday(view.week), addDays(monday(view.week), 6), ds),
        // a week steps while the diary has lessons in the weeks behind or ahead (holiday weeks included)
        olderOk: lessonDays.some((d) => d.date < monday(view.week)),
        newerOk: reachable(view.week + 1),
        step: (delta) => view.showWeek(view.week - delta),
        sheet: {
          label: t('schedule.pickWeek'),
          options: range.map((w) => ({
            key: String(w),
            title: weekTitle(w),
            sub: shortRange(monday(w), addDays(monday(w), 6), ds),
            value: t('lessons.count', { count: count(w) }),
            selected: w === view.week,
            onSelect: () => view.showWeek(w),
          })),
        },
      };
    }
  }

  const timetable = !caps || caps.lessons;
  let body: React.ReactNode;
  if (!timetable)
    body = (
      <EmptyState
        icon={<SchoolIcon size={26} />}
        title={t('schedule.noTimetable')}
        text={t('schedule.noTimetableText')}
      />
    );
  else if (!schedule.data) body = <EmptyState title={schedule.isError ? t('app.error') : t('app.loading')} />;
  else {
    const data = schedule.data;
    const isDay = view.kind === 'day';
    const weekHoliday = !isDay ? holidayWeek(view.week) : null;
    const dayBlock = (date: string) => {
      const lessons = data.days.find((d) => d.date === date)?.lessons ?? [];
      const hol = holidayOn(holidays, date);
      const caption = dayCaption(t, date, today, ds);
      const head = (counts: React.ReactNode) => (
        <div className="flex flex-wrap items-baseline gap-x-2 pt-1 text-[12.5px] text-ink3">
          {!isDay && <b className="text-[14px] text-ink">{caption.label}</b>}
          <span>
            {!isDay && (counts ? `${caption.date} · ` : caption.date)}
            {counts}
          </span>
        </div>
      );
      if (!lessons.length)
        return (
          <section key={date} className="flex flex-col gap-2">
            {!isDay && head(null)}
            {hol ? <HolidayCard h={hol} /> : <EmptyState title={t('schedule.noLessons')} />}
          </section>
        );
      const first = lessons.filter((l) => !l.cancelled && l.slot != null).sort((a, b) => a.slot! - b.slot!)[0];
      return (
        <section key={date} className="flex flex-col gap-2">
          {head(dayCounts(t, lessons, now, tz))}
          {isDay && <Attention studentId={studentId} items={data.attention} today={today} />}
          {first && first.slot! > 1 && (
            <b className="text-[13.5px] text-accent">
              {t(first.start ? 'schedule.startsLater' : 'schedule.startsLaterNoTime', {
                slot: first.slot,
                at: first.start,
                context: first.slot === 2 ? 'second' : undefined,
              })}
            </b>
          )}
          <DayLessons studentId={studentId} date={date} lessons={lessons} tz={tz} bells={school.data?.bells} />
        </section>
      );
    };
    body = weekHoliday ? (
      <HolidayCard h={weekHoliday} />
    ) : (
      <>
        {!isDay && <Attention studentId={studentId} items={data.attention} today={today} />}
        {isDay ? dayBlock(day) : data.days.map((d) => dayBlock(d.date))}
      </>
    );
  }

  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.schedule')} studentId={studentId}>
        {timetable && <PeriodBar model={kindModel} />}
      </ScreenHeader>
      <Body>
        {timetable && <PeriodNav model={nav} />}
        <div
          lang={locale}
          className={`flex flex-col gap-3.5 transition-opacity ${schedule.isPlaceholderData ? 'opacity-50' : ''}`}
        >
          {body}
        </div>
      </Body>
    </Frame>
  );
}
