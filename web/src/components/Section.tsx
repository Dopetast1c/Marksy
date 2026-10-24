import type { CSSProperties, ReactNode } from 'react';
import { ChevIcon } from './icons';

// The pieces lists are made of (the prototype's .sect, .list-card, .row, .stripe): a section heading with a quiet
// note on the right, a card of rows separated by hairlines, a row with a 3 px square side stripe (a subject colour or
// a severity colour, the one shape for both, D36), and the ghost button under a list that opens the screen owning it.

export function SectionHeader({ title, note }: { title: string; note?: ReactNode }) {
  return (
    // a long note goes under the title rather than losing its end
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <h2 className="text-h2 whitespace-nowrap">{title}</h2>
      {note && <span className="min-w-0 text-right text-small text-ink3">{note}</span>}
    </div>
  );
}

export function ListCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col rounded-lg bg-surface px-4 shadow-card">{children}</div>;
}

export type Severity = 'critical' | 'low' | 'neutral' | 'good';

const SEVERITY = {
  critical: 'bg-band-critical-fg',
  low: 'bg-band-low-fg',
  neutral: 'bg-band-ok-fg',
  good: 'bg-band-good-fg',
} as const;

/** A side stripe: a severity colour, or the subject's colour when `subject` style is given */
export function Stripe({ severity, subject }: { severity?: Severity; subject?: CSSProperties }) {
  return subject ? (
    <span className="bg-subject w-[3px] flex-none self-stretch" style={subject} />
  ) : (
    <span className={`w-[3px] flex-none self-stretch ${SEVERITY[severity ?? 'neutral']}`} />
  );
}

/** One row of a list card: stripe, optional leading element, two lines, a chevron; the whole row is the target */
export function Row({
  stripe,
  lead,
  title,
  sub,
  extra,
  trail,
  onClick,
  wrap = false,
  quiet = false,
}: {
  stripe: ReactNode;
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  extra?: ReactNode;
  /** what sits at the right edge instead of the chevron (the comment icon of a mark with a comment) */
  trail?: ReactNode;
  onClick?: () => void;
  /** the second line is the fact itself (a teacher's comment, D56): wrap it, never cut it */
  wrap?: boolean;
  /** a row that is context, not news (an absence in Оценки): muted title */
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 border-t border-line py-3 text-left first:border-t-0"
    >
      {stripe}
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`truncate ${quiet ? 'font-semibold text-ink2' : 'font-bold'}`}>{title}</span>
        {sub && <span className={`text-small ${wrap ? 'text-ink2' : 'truncate text-ink3'}`}>{sub}</span>}
        {extra}
      </span>
      {trail ?? <ChevIcon className="flex-none text-ink3" />}
    </button>
  );
}

/** The quiet button under a list ("Все оценки · 6", "Показать все · 12", "Всё расписание") */
export function MoreButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mt-1 flex min-h-12 w-full items-center justify-center rounded-md bg-surface2 text-[15px] font-extrabold text-ink"
    >
      {children}
    </button>
  );
}
