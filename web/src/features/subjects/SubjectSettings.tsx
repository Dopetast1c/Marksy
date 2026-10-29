import { inSentence } from '@marksy/i18n';
import { scaleValues } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { useState } from 'react';
import type { SubjectColor, SubjectDetail } from '../../api/queries';
import { useSubjectSettings } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Field';
import { CheckIcon, ChevIcon, SlidersIcon } from '../../components/icons';
import { intlLocale, useT } from '../../i18n';
import { SUBJECT_COLORS, subjectStyle } from '../../lib/subject-color';
import { numbers } from '../../lib/numbers';

// «Настройки предмета» (docs/design.md 5.4, 6.6, D32, D45): an entry row in the style of «Итоговые отметки» with one line
// («цель: итог 8 · цвет: синий»), opening a sheet with the goal for the term (every whole value of the child's scale and
// «Без цели») and the colour (the twelve swatches and «Авто»). Changes apply at once behind the sheet. The goal is
// offered only where goals apply (terms, finals and a scale whose final can be computed); a class without marks has
// the colour only.

const colorName = (t: ReturnType<typeof useT>, c: string | null) => (c ? t(`color.${c}`) : t('color.auto'));

export function SubjectSettings({
  studentId,
  subject,
  settings,
  scale,
  termKind,
}: {
  studentId: string;
  subject: SubjectDetail['subject'];
  settings: SubjectDetail['settings'];
  scale: GradingScale | null;
  termKind: string;
}) {
  const t = useT();
  const locale = intlLocale();
  const [open, setOpen] = useState(false);
  const save = useSubjectSettings(studentId, subject.id);
  const goals = settings.goalAvailable && scale ? scaleValues(scale).filter((v) => Number.isInteger(v)) : [];
  const v = (x: number) => (scale ? numbers(scale).value(x) : String(x));
  const line = [
    settings.goalAvailable
      ? settings.goal != null
        ? t('subject.settings.goal', { value: v(settings.goal) })
        : t('subject.settings.noGoal')
      : null,
    t('subject.settings.color', { name: inSentence(colorName(t, subject.color), locale) }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card"
      >
        <span className="grid size-8 flex-none place-items-center rounded-[9px] bg-accent-soft text-accent">
          <SlidersIcon size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[14px]">{t('subject.settings.title')}</b>
          <span className="text-[12.5px] text-ink3">{line}</span>
        </span>
        <ChevIcon className="flex-none text-ink3" />
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        label={t('subject.settings.sheet', { name: subject.name })}
      >
        {/* the sheet is rendered at the end of <body>: it takes the subject's accent itself */}
        <div className="subject-accent flex flex-col gap-2" style={subjectStyle(subject.name, subject.color)}>
          <b className="mb-1 text-[17px]">{t('subject.settings.sheet', { name: subject.name })}</b>
          {goals.length > 0 && (
            <>
              <span className="text-label text-ink3 uppercase">{t(`subject.goal.label.${termKind}`)}</span>
              <div className="grid grid-cols-5 gap-2">
                {goals.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={settings.goal === g}
                    onClick={() => save.goal.mutate(g)}
                    className="min-h-11 rounded-md bg-surface2 text-[15px] font-extrabold text-ink2 aria-pressed:bg-accent aria-pressed:text-accent-ink"
                  >
                    {v(g)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={settings.goal == null}
                onClick={() => save.goal.mutate(null)}
                className="min-h-11 w-full rounded-md bg-surface2 text-[14px] font-extrabold text-ink2 aria-pressed:bg-accent aria-pressed:text-accent-ink"
              >
                {t('subject.goal.none')}
              </button>
              <span className="text-small text-ink3">
                {settings.goal == null
                  ? t('subject.goal.noneNote')
                  : t('subject.goal.note', { value: v(settings.goal) })}
              </span>
            </>
          )}
          <SubjectColorGrid studentId={studentId} subject={subject} />
          <Button onClick={() => setOpen(false)}>{t('subject.settings.done')}</Button>
        </div>
      </BottomSheet>
    </>
  );
}

/** The colour of a subject (6.6): the twelve swatches and «Авто», saved at once; the subject screen's settings sheet and
 * Оформление → Цвета предметов both show it */
export function SubjectColorGrid({
  studentId,
  subject,
}: {
  studentId: string;
  subject: { id: string; name: string; color: string | null };
}) {
  const t = useT();
  const save = useSubjectSettings(studentId, subject.id);
  return (
    <>
      <span className="mt-2 text-label text-ink3 uppercase">{t('subject.color.label')}</span>
      <div className="grid grid-cols-6 gap-2.5 py-1.5">
        {SUBJECT_COLORS.map((c) => {
          const on = subject.color === c;
          return (
            <button
              key={c}
              type="button"
              aria-label={colorName(t, c)}
              aria-pressed={on}
              onClick={() => save.color.mutate(c as SubjectColor)}
              style={subjectStyle(subject.name, c)}
              className={`bg-subject grid aspect-square place-items-center rounded-pill text-[var(--subj-on)] ${on ? 'ring-[3px] ring-ink/70 ring-offset-2 ring-offset-surface' : ''}`}
            >
              {on && <CheckIcon size={18} />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={subject.color == null}
        onClick={() => save.color.mutate(null)}
        className="flex w-full items-center gap-3 py-2 text-left"
      >
        <span className="flex flex-1 flex-col">
          <b>{t('color.auto.title')}</b>
          <span className="text-small text-ink3">{t('color.auto.sub')}</span>
        </span>
        {subject.color == null && <CheckIcon size={22} className="text-accent" />}
      </button>
      <span className="text-small text-ink3">{t('subject.color.note')}</span>
    </>
  );
}
