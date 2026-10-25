import type { ReactNode } from 'react';
import { ChevIcon } from './icons';

// The rows of Ещё and the settings screens (docs/design.md 5.6, the prototype's .list-card and .menu): a card of rows
// separated by hairlines; a row is an icon tile, a bold title, one quiet line and, on the right, a chevron when it
// opens something or a control (a switch) when it is set in place. The whole row is the target of an opening row.

export function MenuCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col rounded-lg bg-surface px-3.5 shadow-card">{children}</div>;
}

export function MenuRow({
  icon,
  title,
  sub,
  onClick,
  control,
  tone = 'accent',
  chevron = true,
  aside,
}: {
  icon: ReactNode;
  title: string;
  sub?: ReactNode;
  /** opens a screen or a sheet: the row is a button with a chevron */
  onClick?: () => void;
  /** set in place (a switch): the row is not a button */
  control?: ReactNode;
  /** quiet: a grey tile (Выйти); avatar: the icon is a person's or a child's picture, shown as it is, no tile */
  tone?: 'accent' | 'quiet' | 'avatar';
  /** an action done in place (Выйти) has no chevron */
  chevron?: boolean;
  /** a short state at the right edge, before the chevron (a diary's «пароль изменился») */
  aside?: ReactNode;
}) {
  const body = (
    <>
      <span
        className={`grid flex-none place-items-center ${
          tone === 'avatar'
            ? 'size-9'
            : `size-8 rounded-[9px] ${tone === 'quiet' ? 'bg-surface2 text-ink3' : 'bg-accent-soft text-accent'}`
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[14px]">{title}</b>
        {sub && <span className="text-[12.5px] text-ink3">{sub}</span>}
      </span>
      {aside}
      {control ?? (onClick && chevron && <ChevIcon className="flex-none text-ink3" />)}
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 border-t border-line py-2 text-left first:border-t-0';
  return onClick && !control ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
