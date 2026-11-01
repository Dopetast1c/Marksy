import type { ReactNode } from 'react';
import type { SubjectInfo } from '../api/queries';
import { useT } from '../i18n';
import { subjectStyle } from '../lib/subject-color';
import { ChevIcon } from './icons';
import { Stripe } from './Section';

// A subject line (docs/design.md 5.3a): the subject's colour stripe, its name as the diary sends it with a quiet
// "adv." (subject.levelShort.*) for a level other than the regular one, the lines the screen gives (the last marks, or
// lessons and the next lesson in a class without marks), the right-hand box (the average with "was" stat.was, or study
// time) and a chevron.

export function SubjectRow({
  subject,
  lines,
  right,
  onClick,
}: {
  subject: SubjectInfo;
  lines: ReactNode;
  right?: ReactNode;
  onClick: () => void;
}) {
  const t = useT();
  const level = subject.level && subject.level !== 'regular' ? subject.level : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 border-t border-line py-3 text-left first:border-t-0"
    >
      <Stripe subject={subjectStyle(subject.name, subject.color)} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold">
          {subject.name}
          {level && (
            <span className="ml-1.5 inline-block rounded-[6px] bg-surface2 px-1.5 py-px align-[2px] text-[10.5px] font-bold text-ink2">
              {t(`subject.levelShort.${level}`)}
            </span>
          )}
        </span>
        {lines}
      </span>
      {right}
      <ChevIcon className="flex-none text-ink3" />
    </button>
  );
}
