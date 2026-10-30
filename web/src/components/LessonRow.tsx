import { inSentence } from '@marksy/i18n';
import { bandOf, lessonNow, lessonPassed, shortDate, weekdayOf } from '@marksy/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLessonActions } from '../api/queries';
import type { Lesson, ScheduleLesson } from '../api/queries';
import { useClock } from '../hooks/useClock';
import { useSimpleMode } from '../hooks/useSimpleMode';
import { useScale } from '../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../i18n';
import { hintText } from '../lib/hints';
import { numbers } from '../lib/numbers';
import { roomLabel } from '../lib/room';
import { subjectStyle } from '../lib/subject-color';
import { formatTime } from '../lib/time';
import {
  AlertNoteIcon,
  AvgNoteIcon,
  BagNoteIcon,
  BookNoteIcon,
  CheckIcon,
  ClockIcon,
  CommentIcon,
  DotsIcon,
  FolderNoteIcon,
  HandNoteIcon,
  LabNoteIcon,
  MarksNoteIcon,
  PenNoteIcon,
  TagIcon,
  TestNoteIcon,
  UpNoteIcon,
} from './icons';
import { LessonMenu } from './LessonMenu';
import { MarkChip } from './MarkChip';
import { BAND_TEXT } from './StatBlock';

// A lesson (docs/design.md 5.5, ux-principles D33, D34, D38, D39, D41): the two-bar row. Time on a left axis (number,
// start, end with bells), a 3 px square bar in the subject colour, subject bold, the room and subgroup, topic muted,
// homework plain (the diary's and the family's own, both when both exist); under it the notes (LessonNote), each with
// its icon on the left axis and a short bar in its own colour, one fact per note, in the order of 5.5. A lesson that
// has passed (core's lessonPassed) keeps only its mark, absence and the teacher's comment, and has no ⋯ menu.
// `compact` (Home tabs.home, "Next lessons" subject.upcoming) keeps ready, lesson type, tag and homework set: no facts,
// signal or advice. Everything you
// can do with a lesson is its ⋯ menu (LessonMenu): the button, or a tap anywhere on the row but the subject name.
// Missing slots are rows of their own (GapRow, D37).

export type NoteTone = 'good' | 'call' | 'info' | 'low' | 'critical' | 'top';

const BAR: Record<NoteTone, string> = {
  good: 'bg-band-good-fg',
  top: 'bg-band-top-bg',
  call: 'bg-accent',
  info: 'bg-ink3/55',
  low: 'bg-band-low-fg',
  critical: 'bg-band-critical-fg',
};
const ICON: Record<NoteTone, string> = {
  good: 'text-band-good-fg',
  top: 'text-band-top-bg',
  call: 'text-accent',
  info: 'text-ink3',
  low: 'text-band-low-fg',
  critical: 'text-band-critical-fg',
};

export function LessonNote({ icon, tone, children }: { icon: ReactNode; tone: NoteTone; children: ReactNode }) {
  return (
    <div className="-ml-14 grid w-[calc(100%+56px)] grid-cols-[46px_3px_1fr] items-start gap-x-2.5 text-[12.5px] leading-[1.4] text-ink2">
      <span className={`flex justify-end pt-[3px] ${ICON[tone]}`}>{icon}</span>
      <i className={`self-stretch ${BAR[tone]}`} />
      <span className="py-[3px]">{children}</span>
    </div>
  );
}

/** A tag's line icon from the app set (6.3); an unknown name falls back to the tag shape */
export function TagNoteIcon({ name, size = 16 }: { name: string | null; size?: number }) {
  const Icon =
    {
      test: TestNoteIcon,
      book: BookNoteIcon,
      pen: PenNoteIcon,
      bag: BagNoteIcon,
      folder: FolderNoteIcon,
      lab: LabNoteIcon,
    }[name ?? ''] ?? TagIcon;
  return <Icon size={size} />;
}

const SPECIAL_TYPES = new Set(['lab', 'practical', 'excursion']);

function TimeCell({ slot, start, end }: { slot: number | null; start: string | null; end: string | null }) {
  return (
    <div className="flex flex-col items-end gap-px pt-px text-[12px] leading-[1.2] font-semibold text-ink3 tabular-nums">
      {slot != null && <b className="text-[17px] font-extrabold text-ink2">{slot}</b>}
      {start && <span>{start}</span>}
      {end && <span className="text-[11px] font-medium opacity-85">{end}</span>}
    </div>
  );
}

type RowLesson = Lesson & { notes?: ScheduleLesson['notes'] };

export function LessonRow({
  studentId,
  lesson,
  tz,
  compact = false,
}: {
  studentId: string;
  lesson: RowLesson;
  tz: string;
  compact?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const now = useClock();
  const [menu, setMenu] = useState(false);
  const simple = useSimpleMode();
  const locale = intlLocale();
  const ds = dateStyle();
  const subject = subjectStyle(lesson.subjectName, lesson.subjectColor);
  const passed = lessonPassed(lesson, now, tz);
  const current = !lesson.cancelled && lessonNow(lesson, now, tz);
  // every subject name is a link (principle 9)
  const openSubject = () => navigate(`/s/${studentId}/subjects/${lesson.subjectId}`);
  const menuSheet = !passed && (
    <LessonMenu studentId={studentId} lesson={lesson} tz={tz} open={menu} onOpenChange={setMenu} />
  );
  const dots = !passed && (
    <button
      type="button"
      aria-label={t('lessonMenu.open')}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.stopPropagation();
        setMenu(true);
      }}
      className="relative -mt-1 -mr-1.5 grid size-8 flex-none place-items-center text-ink3 after:absolute after:-inset-1.5"
    >
      <DotsIcon size={20} />
    </button>
  );
  // a tap anywhere on the row opens the menu (a pointer convenience; the ⋯ button is the accessible entry, so the row
  // is no button with buttons inside), but not the subject name (it opens the subject) nor a swipe (useSwipe eats it)
  const rowProps = passed ? {} : { onClick: () => setMenu(true) };
  const subjectLink = (struck: boolean) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openSubject();
      }}
      className={`-my-2.5 self-start py-2.5 text-left text-[15.5px] font-extrabold ${struck ? 'text-ink3 line-through' : ''}`}
    >
      {lesson.subjectName}
    </button>
  );

  // the sheet sits beside the row, not inside it: a click in a portal still bubbles through the React tree
  if (lesson.cancelled)
    return (
      <>
        <div
          {...rowProps}
          className="grid cursor-pointer grid-cols-[46px_1fr] gap-2.5 border-t border-line py-3 first:border-t-0"
          style={subject}
        >
          <TimeCell slot={lesson.slot} start={lesson.start} end={lesson.end} />
          <div className="grid grid-cols-[3px_1fr_auto] gap-2.5">
            <i className="bg-subject self-stretch opacity-30" />
            <div className="flex flex-col gap-[3px]">
              {subjectLink(true)}
              <span className="text-small text-ink3">{t('lesson.cancelled')}</span>
            </div>
            {dots}
          </div>
        </div>
        {menuSheet}
      </>
    );

  const notes: ReactNode[] = [];
  if (lesson.ready && !passed) {
    const by = lesson.ready.by;
    const who = by?.otherFamily ? t('lesson.readyOtherFamily') : (by?.name ?? null);
    const at = formatTime(lesson.ready.at, tz, locale);
    notes.push(
      <LessonNote key="ready" tone="good" icon={<CheckIcon size={16} />}>
        <b className="text-ink">{t('lesson.ready')}</b> · {who ? t('lesson.readyBy', { who, at }) : at}
      </LessonNote>,
    );
  }
  // mark: one fact per note, the mark first (its band's bar), then the kind of work and the teacher's comment
  // without labels, only when the diary set them (D50)
  for (const m of lesson.marks) {
    notes.push(
      <LessonNote key={`m-${m.id}`} tone={m.band ?? 'info'} icon={<MarksNoteIcon size={16} />}>
        <span className="inline-flex items-center gap-1.5">
          {t('lesson.markNote')} <MarkChip mark={m} small />
        </span>
      </LessonNote>,
    );
    if (m.workType)
      notes.push(
        <LessonNote key={`w-${m.id}`} tone="info" icon={<PenNoteIcon size={16} />}>
          {t(`workType.${m.workType}`)}
        </LessonNote>,
      );
    if (m.comment)
      notes.push(
        <LessonNote key={`c-${m.id}`} tone="info" icon={<CommentIcon size={16} />}>
          {t('event.quote', { text: m.comment })}
        </LessonNote>,
      );
  }
  if (lesson.absent)
    notes.push(
      <LessonNote key="absent" tone="info" icon={<ClockIcon size={16} />}>
        {t('lesson.absentNote')}
      </LessonNote>,
    );
  if (lesson.teacherComment)
    notes.push(
      <LessonNote key="remark" tone="info" icon={<CommentIcon size={16} />}>
        {t('lesson.teacherComment', { text: lesson.teacherComment })}
      </LessonNote>,
    );
  if (!passed) {
    if (lesson.lessonType && SPECIAL_TYPES.has(lesson.lessonType))
      notes.push(
        <LessonNote key="type" tone="call" icon={<LabNoteIcon size={16} />}>
          <b className="text-ink">{t(`lesson.typeNote.${lesson.lessonType}`)}</b>
        </LessonNote>,
      );
    // tag: due here, in the tag's tone; a homework hit says what was set and when
    for (const h of lesson.tags)
      notes.push(
        <LessonNote
          key={`t-${h.tag.id}`}
          tone={h.tag.tone === 'important' ? 'low' : 'call'}
          icon={<TagNoteIcon name={h.tag.icon} />}
        >
          <b className="text-ink">{h.tag.name}</b>
          {h.field === 'homework' && h.snippet && (
            <>
              {' · '}
              {h.snippet}
              {h.setOn && <span className="text-ink3"> {t('lesson.tagSetOn', { date: shortDate(h.setOn, ds) })}</span>}
            </>
          )}
        </LessonNote>,
      );
    for (const h of lesson.setHere)
      notes.push(
        <LessonNote key={`s-${h.tag.id}`} tone="info" icon={<TagNoteIcon name={h.tag.icon} />}>
          {t('lesson.taggedHomework', {
            tag: inSentence(h.tag.name, locale),
            date: shortDate(h.dueDate, ds, { weekday: true }),
          })}
        </LessonNote>,
      );
  }
  // simple mode (5.7) has no statistics or advice: its rows carry what a compact row carries
  const n = !passed && !compact && !simple ? lesson.notes : null;
  if (n && scale) {
    const fmt = numbers(scale);
    if (n.hint) {
      const tone = n.hint.severity === 'critical' ? 'critical' : n.hint.severity === 'low' ? 'low' : 'info';
      const fact = hintText(t, n.hint.fact, scale, ds);
      const advice = n.hint.advice ? hintText(t, n.hint.advice, scale, ds) : null;
      notes.push(
        <LessonNote
          key="hint"
          tone={tone}
          icon={tone === 'critical' ? <AlertNoteIcon size={16} /> : <UpNoteIcon size={16} />}
        >
          {/* the action first, the reason after it */}
          <b className="text-ink">{advice ?? fact}</b>
          {advice && <> · {fact}</>}
        </LessonNote>,
      );
    }
    if (n.signal) {
      const s = n.signal;
      notes.push(
        <LessonNote
          key="signal"
          tone={s.kind === 'call' ? 'call' : 'low'}
          icon={s.kind === 'push' ? <UpNoteIcon size={16} /> : <HandNoteIcon size={16} />}
        >
          <b className="text-ink">{t(`lesson.signal.${s.kind}`)}</b>
          {' · '}
          {s.kind === 'push'
            ? t('lesson.signal.pushSub', { average: fmt.average(s.average) })
            : t(`lesson.signal.${s.kind}Sub`, { count: s.lessons })}
        </LessonNote>,
      );
    }
    if (n.facts) {
      const f = n.facts;
      // the average in its band colour (5.5): a judgement colour, so the number is always there too
      const band = f.average != null ? bandOf(scale, f.average) : null;
      notes.push(
        <LessonNote key="avg" tone="info" icon={<AvgNoteIcon size={16} />}>
          {t('lesson.facts.average')} <b className={band ? BAND_TEXT[band] : ''}>{fmt.average(f.average)}</b>
        </LessonNote>,
        <LessonNote key="last" tone="info" icon={<MarksNoteIcon size={16} />}>
          <span className="inline-flex flex-wrap items-center gap-1">
            {t('lesson.facts.last')}
            {f.last.map((m) => (
              <MarkChip key={m.id} mark={m} small />
            ))}
          </span>
        </LessonNote>,
        <LessonNote key="lastDate" tone="info" icon={<ClockIcon size={16} />}>
          {t('lesson.facts.lastMark', {
            date: shortDate(f.lastDate, ds),
            ago: f.since === 0 ? t('lesson.facts.agoLast') : t('lesson.facts.ago', { count: f.since }),
          })}
        </LessonNote>,
      );
    } else
      notes.push(
        <LessonNote key="nofacts" tone="info" icon={<MarksNoteIcon size={16} />}>
          {t('lesson.facts.none')}
        </LessonNote>,
      );
  }

  const where = [roomLabel(t, lesson.room), lesson.groupLabel].filter(Boolean).join(' · ');
  const own = lesson.ownHomework[0]?.text ?? null;
  return (
    <>
      <div
        {...rowProps}
        data-ready={(!!lesson.ready && !passed) || undefined}
        className={`grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-3 first:border-t-0 ${
          current ? '-mr-3.5 -ml-2 bg-accent-soft pr-3.5 pl-2 first:rounded-t-lg last:rounded-b-lg' : ''
        } ${passed ? '' : 'cursor-pointer'}`}
        style={subject}
      >
        <TimeCell slot={lesson.slot} start={lesson.start} end={lesson.end} />
        <div className="flex min-w-0 flex-col">
          <div className="grid grid-cols-[3px_1fr_auto] gap-2.5">
            <i className="bg-subject self-stretch" />
            {/* a lesson marked ready fades its texts a step (5.5) */}
            <div className={`flex min-w-0 flex-col gap-[3px] ${lesson.ready && !passed ? 'opacity-75' : ''}`}>
              <span className="flex flex-wrap items-baseline gap-2">
                {subjectLink(false)}
                {current && (
                  <span className="rounded-pill bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
                    {t('lesson.now')}
                  </span>
                )}
              </span>
              {where && <span className="-mt-px text-[12.5px] text-ink3">{where}</span>}
              {lesson.topic && <span className="text-[13px] text-ink3">{lesson.topic}</span>}
              {lesson.homework && <span className="text-[13.5px] leading-[1.4] text-ink">{lesson.homework}</span>}
              {/* the family's own homework next to the diary's: when the diary later sends its own, both stay (6.5) */}
              {own && <span className="text-[13.5px] leading-[1.4] text-ink">{own}</span>}
            </div>
            {dots}
          </div>
          {notes.length > 0 && <div className="mt-1.5 flex flex-col gap-1">{notes}</div>}
          {simple && !passed && <ReadyButton studentId={studentId} lesson={lesson} />}
        </div>
      </div>
      {menuSheet}
    </>
  );
}

/**
 * The large "Ready" (lesson.simple.ready) of simple mode (D41's one exception, design.md 5.7): the same lesson_prep
 * tick as the menu's first action, as a button a first-grader finds; pressed when the lesson is ready, a second press takes it back.
 */
function ReadyButton({ studentId, lesson }: { studentId: string; lesson: RowLesson }) {
  const t = useT();
  const { prep } = useLessonActions(studentId);
  const [failed, setFailed] = useState(false);
  const ready = !!lesson.ready;
  return (
    <>
      <button
        type="button"
        aria-pressed={ready}
        disabled={prep.isPending}
        onClick={(e) => {
          e.stopPropagation();
          setFailed(false);
          prep.mutate({ lessonId: lesson.id, done: !ready }, { onError: () => setFailed(true) });
        }}
        className={`mt-2 flex min-h-12 items-center justify-center gap-2 rounded-md text-[16px] font-extrabold disabled:opacity-70 ${
          ready ? 'bg-band-good-bg text-band-good-fg' : 'bg-accent text-accent-ink'
        }`}
      >
        {ready && <CheckIcon size={20} />}
        {t('lesson.simple.ready')}
      </button>
      {failed && <span className="mt-1 text-small text-band-critical-fg">{t('lessonMenu.failed')}</span>}
    </>
  );
}

/** An empty slot: "no lesson" (lesson.noLesson) before a late start, "free period" (lesson.window) in the middle of
 * the day (D37) */
export function GapRow({
  slot,
  start,
  end,
  first,
}: {
  slot: number;
  start: string | null;
  end: string | null;
  first: boolean;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-2 first:border-t-0">
      <div className="opacity-70">
        <TimeCell slot={slot} start={start} end={end} />
      </div>
      <div className="grid grid-cols-[3px_1fr] gap-2.5">
        <i className="w-0 self-stretch border-l-2 border-dashed border-line" />
        <span className="self-center text-[13px] text-ink3 italic">
          {first ? t('lesson.noLesson') : t('lesson.window')}
        </span>
      </div>
    </div>
  );
}

type Bells = { days: number[]; periods: { slot: number; start: string; end: string }[] }[];

/**
 * The lessons of one day as one list (D34, D37): rows in slot order, the slots from 1 to the last lesson filled with
 * gap rows (a missing one before the first lesson that takes place is lesson.noLesson, later a lesson.window), their
 * times from
 * the child's bells for that weekday. Without slot numbers the lessons are listed as they are.
 */
export function DayLessons({
  studentId,
  date,
  lessons,
  tz,
  bells,
  compact = false,
}: {
  studentId: string;
  date: string;
  lessons: readonly RowLesson[];
  tz: string;
  bells: Bells | undefined;
  compact?: boolean;
}) {
  const sorted = [...lessons].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  const first = sorted.find((l) => !l.cancelled && l.slot != null);
  const day = bells?.find((b) => b.days.includes(weekdayOf(date))) ?? bells?.[0];
  const row = (l: RowLesson) => <LessonRow key={l.id} studentId={studentId} lesson={l} tz={tz} compact={compact} />;
  const rows: ReactNode[] = [];
  const slots = sorted.map((l) => l.slot).filter((s): s is number => s != null);
  if (slots.length === sorted.length && slots.length) {
    for (let s = 1; s <= Math.max(...slots); s++) {
      const here = sorted.filter((l) => l.slot === s);
      if (here.length) here.forEach((l) => rows.push(row(l)));
      else {
        const b = day?.periods.find((p) => p.slot === s);
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
  } else sorted.forEach((l) => rows.push(row(l)));
  return <div className="flex flex-col rounded-lg bg-surface py-1 pr-3.5 pl-2 shadow-card">{rows}</div>;
}
