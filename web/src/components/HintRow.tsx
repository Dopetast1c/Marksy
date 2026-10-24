import type { ReactNode } from 'react';
import { Stripe } from './Section';
import type { Severity } from './Section';

// «Обратить внимание» (docs/design.md 5.4, 5.5): a tinted card with a small caps title and rows of a severity stripe, a
// bold line and a quiet line. One component for the subject screen's block now and the timetable's later (M5c). A
// hint is a HintRow; so is the goal row and, with M6, a lesson that carries a tag.

export function AttentionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-md bg-accent-soft px-3.5 py-3" aria-label={title}>
      <span className="text-[12px] font-extrabold tracking-[.04em] text-accent uppercase">{title}</span>
      {children}
    </section>
  );
}

export function HintRow({
  severity,
  title,
  sub,
  note,
}: {
  severity: Severity;
  title: string;
  /** the second line: what follows from the fact, or the advice (gone with guidance off) */
  sub?: string | null;
  /** a third, quieter line */
  note?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5 text-left text-[13px] leading-[1.35]">
      <span className="mt-[3px] flex h-3.5 flex-none">
        <Stripe severity={severity} />
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <b className="text-[14px]">{title}</b>
        {sub && <span className="text-[12.5px] text-ink2">{sub}</span>}
        {note && <span className="text-[12.5px] text-ink3">{note}</span>}
      </span>
    </div>
  );
}
