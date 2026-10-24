import { addDays, shortDate } from '@marksy/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ApiFailure } from '../api/client';
import type { Lesson } from '../api/queries';
import { useLessonActions } from '../api/queries';
import { dateStyle, intlLocale, useT } from '../i18n';
import { formatTime, todayIn } from '../lib/time';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, OffIcon, PenNoteIcon, UncheckIcon, UndoIcon } from './icons';

// Everything you can do with a lesson (docs/design.md 5.5, 6.5, ux-principles D41): one bottom sheet, always in this
// order: «Отметить «готово»» / «Снять отметку «готово»», «Добавить задание» / «Изменить задание» (not when only the
// diary's homework exists), «Урока не будет»; a cancelled lesson offers only «Вернуть урок». A choice closes the sheet
// and the row changes at once (the cache is patched); if the server refuses (the lesson has just passed, no network)
// the sheet comes back with one line saying so. Homework the diary lacks is typed in a second sheet; who added it is
// stored, not shown.

function Option({
  icon,
  tone = 'plain',
  title,
  sub,
  onClick,
}: {
  icon: ReactNode;
  tone?: 'ok' | 'plain' | 'quiet';
  title: string;
  sub?: string | null;
  onClick: () => void;
}) {
  const tile =
    tone === 'ok'
      ? 'bg-band-good-bg text-band-good-fg'
      : tone === 'quiet'
        ? 'bg-surface2 text-ink3'
        : 'bg-accent-soft text-accent';
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left">
      <span className={`grid size-10 flex-none place-items-center rounded-md ${tile}`}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <b>{title}</b>
        {sub && <span className="truncate text-small text-ink3">{sub}</span>}
      </span>
    </button>
  );
}

export function LessonMenu({
  studentId,
  lesson,
  tz,
  open,
  onOpenChange,
}: {
  studentId: string;
  lesson: Lesson;
  tz: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const ds = dateStyle();
  const locale = intlLocale();
  const { prep, cancel, homework } = useLessonActions(studentId);
  const [mode, setMode] = useState<'menu' | 'homework'>('menu');
  const [error, setError] = useState<string | null>(null);
  const own = lesson.ownHomework[0] ?? null;
  const [text, setText] = useState('');

  const today = todayIn(tz);
  const day =
    lesson.date === today
      ? t('day.today').toLocaleLowerCase(locale)
      : lesson.date === addDays(today, 1)
        ? t('home.tomorrow').toLocaleLowerCase(locale)
        : shortDate(lesson.date, ds, { weekday: true });
  const when = [day, lesson.start].filter(Boolean).join(' ');
  const title =
    lesson.slot != null
      ? t('lessonMenu.title', { subject: lesson.subjectName, slot: lesson.slot, when })
      : t('lessonMenu.titleNoSlot', { subject: lesson.subjectName, when });

  const close = () => {
    onOpenChange(false);
    setMode('menu');
  };
  const failed = (e: unknown) => {
    setError(
      e instanceof ApiFailure && e.error?.code === 'lesson_passed'
        ? t('lessonMenu.failedPassed')
        : e instanceof ApiFailure && e.error?.code === 'diary_has_lesson'
          ? t('lessonMenu.failedDiary')
          : t('lessonMenu.failed'),
    );
    setMode('menu');
    onOpenChange(true);
  };
  const act = (run: (opts: { onError: (e: unknown) => void }) => void) => {
    setError(null);
    close();
    run({ onError: failed });
  };

  let body: ReactNode;
  if (mode === 'homework') {
    const save = () => {
      const value = text.trim();
      if (!value) return;
      act((o) =>
        homework.mutate(
          own ? { op: 'edit', itemId: own.id, text: value } : { op: 'add', lessonId: lesson.id, text: value },
          o,
        ),
      );
    };
    body = (
      <>
        <span className="text-label text-ink3 uppercase">
          {t(own ? 'homeworkSheet.edit' : 'homeworkSheet.add', { subject: lesson.subjectName, when })}
        </span>
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">{t('homeworkSheet.label')}</span>
          <textarea
            rows={3}
            autoFocus
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('homeworkSheet.placeholder')}
            className="w-full rounded-md border border-line bg-surface2 px-3 py-2.5 text-[15px] outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={save}
          className="h-12 rounded-pill bg-accent font-bold text-accent-ink disabled:opacity-40"
        >
          {t('homeworkSheet.save')}
        </button>
        {own && (
          <button
            type="button"
            onClick={() => act((o) => homework.mutate({ op: 'remove', itemId: own.id }, o))}
            className="h-11 rounded-pill font-bold text-band-critical-fg"
          >
            {t('homeworkSheet.remove')}
          </button>
        )}
        <span className="text-small text-ink3">{t('homeworkSheet.note')}</span>
      </>
    );
  } else if (lesson.cancelled) {
    body = (
      <Option
        icon={<UndoIcon size={20} />}
        title={t('lessonMenu.restore')}
        sub={t('lessonMenu.restoreSub')}
        onClick={() => act((o) => cancel.mutate({ lessonId: lesson.id, cancelled: false }, o))}
      />
    );
  } else {
    const ready = lesson.ready;
    const readyAt = ready ? formatTime(ready.at, tz, locale) : '';
    body = (
      <>
        {ready ? (
          <Option
            icon={<UncheckIcon size={20} />}
            title={t('lessonMenu.unready')}
            sub={
              ready.by?.otherFamily
                ? t('lessonMenu.readyOtherFamily', { at: readyAt })
                : ready.by?.name
                  ? t('lessonMenu.readyBy', { who: ready.by.name, at: readyAt })
                  : readyAt
            }
            onClick={() => act((o) => prep.mutate({ lessonId: lesson.id, done: false }, o))}
          />
        ) : (
          <Option
            icon={<CheckIcon size={20} />}
            tone="ok"
            title={t('lessonMenu.ready')}
            sub={t('lessonMenu.readySub')}
            onClick={() => act((o) => prep.mutate({ lessonId: lesson.id, done: true }, o))}
          />
        )}
        {(own || !lesson.homework) && (
          <Option
            icon={<PenNoteIcon size={20} />}
            title={t(own ? 'lessonMenu.editHomework' : 'lessonMenu.addHomework')}
            sub={own ? own.text : t('lessonMenu.addHomeworkSub')}
            onClick={() => {
              setError(null);
              setText(own?.text ?? '');
              setMode('homework');
            }}
          />
        )}
        <Option
          icon={<OffIcon size={20} />}
          tone="quiet"
          title={t('lessonMenu.cancel')}
          sub={t('lessonMenu.cancelSub')}
          onClick={() => act((o) => cancel.mutate({ lessonId: lesson.id, cancelled: true }, o))}
        />
      </>
    );
  }

  return (
    <BottomSheet open={open} onClose={close} label={title}>
      {mode === 'menu' && <span className="text-label text-ink3 uppercase">{title}</span>}
      {error && (
        <span role="alert" className="text-small font-semibold text-band-critical-fg">
          {error}
        </span>
      )}
      {body}
    </BottomSheet>
  );
}
