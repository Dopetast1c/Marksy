import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Lesson } from '../api/queries';
import { intlLocale, useT } from '../i18n';
import { subjectStyle } from '../lib/subject-color';
import { formatTime } from '../lib/time';
import { CheckIcon, LabNoteIcon } from './icons';

// A lesson (docs/design.md 5.5, ux-principles D33, D34, D38, D39): the two-bar row. Time on a left axis (number, start,
// end with bells), a 3 px square bar in the subject colour, subject bold, the room, topic muted, homework plain; under
// it the пометки, each with its icon on the left axis and a short bar in its own colour. `compact` (Главная, «Ближайшие
// уроки») keeps only готово, тип урока, тег and задали: no факты, сигнал or подсказка. The ⋯ menu (LessonMenu) and the
// tag notes come with M5c and M6. Missing slots are rows of their own (GapRow, D37).

export function LessonNote({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone: 'good' | 'call' | 'info';
  children: ReactNode;
}) {
  const bar = tone === 'good' ? 'bg-band-good-fg' : tone === 'call' ? 'bg-accent' : 'bg-ink3/55';
  const ic = tone === 'good' ? 'text-band-good-fg' : tone === 'call' ? 'text-accent' : 'text-ink3';
  return (
    <div className="-ml-14 grid w-[calc(100%+56px)] grid-cols-[46px_3px_1fr] items-start gap-x-2.5 text-[12.5px] leading-[1.4] text-ink2">
      <span className={`flex justify-end pt-[3px] ${ic}`}>{icon}</span>
      <i className={`self-stretch ${bar}`} />
      <span className="py-[3px]">{children}</span>
    </div>
  );
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

export function LessonRow({
  studentId,
  lesson,
  tz,
  compact = false,
}: {
  studentId: string;
  lesson: Lesson;
  tz: string;
  compact?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const locale = intlLocale();
  const subject = subjectStyle(lesson.subjectName, lesson.subjectColor);
  // every subject name is a link (principle 9)
  const openSubject = () => navigate(`/s/${studentId}/subjects/${lesson.subjectId}`);
  if (lesson.cancelled)
    return (
      <div className="grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-3 first:border-t-0" style={subject}>
        <TimeCell slot={lesson.slot} start={lesson.start} end={lesson.end} />
        <div className="grid grid-cols-[3px_1fr] gap-2.5">
          <i className="bg-subject self-stretch opacity-30" />
          <div className="flex flex-col gap-[3px]">
            <span className="font-extrabold text-ink3 line-through">{lesson.subjectName}</span>
            <span className="text-small text-ink3">{t('lesson.cancelled')}</span>
          </div>
        </div>
      </div>
    );
  const notes: ReactNode[] = [];
  if (lesson.ready) {
    const by = lesson.ready.by;
    const who = by?.otherFamily ? t('lesson.readyOtherFamily') : (by?.name ?? null);
    const at = formatTime(lesson.ready.at as unknown as string, tz, locale);
    notes.push(
      <LessonNote key="ready" tone="good" icon={<CheckIcon size={16} />}>
        <b className="text-ink">{t('lesson.ready')}</b> · {who ? t('lesson.readyBy', { who, at }) : at}
      </LessonNote>,
    );
  }
  if (lesson.lessonType && SPECIAL_TYPES.has(lesson.lessonType))
    notes.push(
      <LessonNote key="type" tone="call" icon={<LabNoteIcon size={16} />}>
        <b className="text-ink">{t(`lesson.typeNote.${lesson.lessonType}`)}</b>
      </LessonNote>,
    );
  const homework = lesson.homework ?? lesson.ownHomework[0]?.text ?? null;
  return (
    <div className="grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-3 first:border-t-0" style={subject}>
      <TimeCell slot={lesson.slot} start={lesson.start} end={lesson.end} />
      <div className="flex min-w-0 flex-col">
        <div className="grid grid-cols-[3px_1fr] gap-2.5">
          <i className="bg-subject self-stretch" />
          <div className="flex min-w-0 flex-col gap-[3px]">
            <button
              type="button"
              onClick={openSubject}
              className="-my-2.5 self-start py-2.5 text-left text-[15.5px] font-extrabold"
            >
              {lesson.subjectName}
            </button>
            {lesson.room && (
              <span className="-mt-px text-[12.5px] text-ink3">{t('lesson.room', { room: lesson.room })}</span>
            )}
            {lesson.topic && <span className="text-[13px] text-ink3">{lesson.topic}</span>}
            {homework && <span className="text-[13.5px] leading-[1.4] text-ink">{homework}</span>}
          </div>
        </div>
        {/* the full row (Расписание, M5c) adds факты, сигнал and подсказка here; the compact one never does */}
        {notes.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1" data-compact={compact || undefined}>
            {notes}
          </div>
        )}
      </div>
    </div>
  );
}

/** An empty slot: «урока нет» before a late start, «окно» in the middle of the day (D37) */
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
