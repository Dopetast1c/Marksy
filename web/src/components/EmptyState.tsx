import type { ReactNode } from 'react';

// An empty, loading or not-yet-built state: a short bold line and, if needed, one sentence (ux-principles 5).

export function EmptyState({ title, text, icon }: { title: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
      {icon && (
        <span className="grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent">{icon}</span>
      )}
      <b className="text-h2">{title}</b>
      {text && <p className="m-0 max-w-[28ch] text-[14px] text-ink2">{text}</p>}
    </div>
  );
}
