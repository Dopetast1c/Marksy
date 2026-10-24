import { useCapabilities } from '../hooks/useStudent';
import { useT } from '../i18n';
import { markFilterQuery, useMarkFilter } from '../state/store';

// The mark filter chips (docs/design.md 5.3, D27, D56): one component and one piece of state for Оценки, Предметы and
// Предмет. Все; Теги ▾ with its sheet once the family has tags (M6; the state and the API parameters are already
// there); Комментарии where the diary has the teacher's comments without a mark. No work-type, threshold or absence
// chips. A row left with only Все says nothing and is not shown. It scrolls sideways, so a swipe on it never steps
// the period (data-hscroll).

export function MarkFilter({ studentId }: { studentId: string }) {
  const t = useT();
  const caps = useCapabilities(studentId);
  const f = useMarkFilter();
  const comments = !!caps?.behaviour && caps.behaviour !== 'none';
  if (!comments) return null;
  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-9 flex-none items-center gap-1.5 rounded-pill bg-surface px-3 text-[13px] font-bold text-ink2 shadow-card aria-pressed:bg-accent aria-pressed:text-accent-ink"
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t('filter.label')}
      data-hscroll
      className="-mx-1 -my-0.5 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]"
    >
      {chip(t('filter.all'), !f.comments && !f.tags.length, f.clear)}
      {chip(t('filter.comments'), f.comments, () => f.setComments(!f.comments))}
    </div>
  );
}

/**
 * The filter as it applies to this child: Комментарии only where the diary has them (the state is shared by the
 * children, D27, and must not leave a child whose diary has none with an empty list and no chip to undo it)
 */
export function useMarkFilterFor(studentId: string) {
  const caps = useCapabilities(studentId);
  const f = useMarkFilter();
  const comments = f.comments && !!caps?.behaviour && caps.behaviour !== 'none';
  const tags = f.tags;
  return { comments, tags, on: comments || tags.length > 0, query: markFilterQuery({ ...f, comments }) };
}
