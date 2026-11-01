import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../api/queries';
import { useStudent } from '../hooks/useStudent';
import { useT } from '../i18n';
import { FreshnessBanner } from './FreshnessBanner';
import { BackIcon } from './icons';
import { StudentBar } from './StudentBar';

// The one header of every student screen (CLAUDE.md, docs/design.md 4, ux-principles D15): one row with the title on
// the left, the selected child's name and class in small type under it, the StudentBar on the right; then the
// controls that drive the screen (the period kind) and the freshness banner. No screen renders its own header. The
// bell (inbox) joins the row with M9; a student sees no bar and no name.

export function ScreenHeader({
  title,
  studentId,
  back = false,
  accent,
  titleIsData = false,
  children,
}: {
  title: string;
  studentId: string;
  back?: boolean;
  /** the subject screen (D45): the header on a tint of the subject colour, the title in its shade, the controls in it */
  accent?: CSSProperties;
  /** the title comes from the diary (a subject's name): it may be cut to one line (data-content, docs/i18n.md 5) */
  titleIsData?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const navigate = useNavigate();
  const me = useMe();
  const student = useStudent(studentId);
  const parent = me.data?.family?.role !== 'student';
  return (
    <header
      style={accent}
      className={`flex flex-col gap-2.5 px-5 pt-1.5 pb-3 ${accent ? 'subject-accent bg-subject-tint' : ''}`}
    >
      <div data-header-row className="flex min-h-9 items-center justify-between gap-2.5">
        {back && (
          <button
            type="button"
            aria-label={t('header.back')}
            // opened from a link with no screen of this app behind it: back is the child's Home (tabs.home), not out of the app
            onClick={() =>
              (window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate(`/s/${studentId}`)
            }
            className="-ml-3 grid size-11 place-items-center rounded-pill text-ink2 hover:bg-surface2"
          >
            <BackIcon size={22} />
          </button>
        )}
        <div data-header-title className="flex min-w-[140px] flex-1 flex-col gap-px">
          <h1
            {...(titleIsData && { 'data-content': '' })}
            className={`truncate text-h1 tracking-[-0.01em] ${accent ? 'text-subject-title' : ''}`}
          >
            {title}
          </h1>
          {parent && student && (
            <span className="truncate text-[12px] font-semibold text-ink3">
              {student.classLabel ? `${student.name} · ${student.classLabel}` : student.name}
            </span>
          )}
        </div>
        {parent && (
          <div className="flex flex-none items-center gap-2.5">
            <StudentBar activeId={studentId} />
          </div>
        )}
      </div>
      {children}
      <FreshnessBanner studentId={studentId} />
    </header>
  );
}
