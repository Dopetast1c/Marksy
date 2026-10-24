import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from './icons';

// Choices with more than four options or with explanations open a bottom sheet, never a native select (ux-principles
// D32). While a sheet is open the period swipe is off (lib/swipe.ts reads body[data-sheet-open]).

export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    document.body.dataset.sheetOpen = 'true';
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      delete document.body.dataset.sheetOpen;
      window.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  if (!open) return null;
  // rendered at the end of <body>: a sticky parent (the period navigator) must not trap it under the tab bar
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/45" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="flex max-h-[88%] w-full max-w-[560px] flex-col gap-1.5 overflow-y-auto rounded-t-[24px] bg-surface px-5 pt-2.5 pb-7 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2.5 h-1 w-10 rounded-pill bg-line" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** One row of a sheet: two lines on the left, a value and a check on the right */
export function SheetOption({
  title,
  sub,
  value,
  selected,
  onSelect,
}: {
  title: string;
  sub?: string;
  value?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-2.5 text-left"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="flex-1">
        <b className="block">{title}</b>
        {sub && <span className="text-small text-ink3">{sub}</span>}
      </span>
      {value && <span className="text-small text-ink3">{value}</span>}
      {selected && <CheckIcon size={22} className="text-accent" />}
    </button>
  );
}
