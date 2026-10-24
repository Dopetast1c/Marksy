import type { Schemas } from '../api/client';
import { CommentIcon } from './icons';

// A mark (ux-principles principle 5, D3): the raw mark as the diary wrote it, on the band's fill; colour is never the
// only signal, the value is always on the chip. Non-numeric kinds (зач., осв.) use the neutral style. A mark the
// teacher corrected or removed is shown quietly (an outline, struck through when removed), so it is never counted by
// eye next to the live marks. The test pencil comes with the tag «Контрольная» (M6). Absences and the teacher's
// comments sit in lists of marks with chips of their own shape below, never a mark's.

export type Mark = Schemas['MarkChip'];

const FILL = {
  critical: 'bg-band-critical-bg text-band-critical-fg',
  low: 'bg-band-low-bg text-band-low-fg',
  good: 'bg-band-good-bg text-band-good-fg',
  top: 'bg-band-top-bg text-band-top-fg',
} as const;

const SIZE = {
  normal: 'h-[30px] min-w-[30px] rounded-[9px] px-[7px] text-[14px]',
  small: 'h-6 min-w-6 rounded-[7px] px-[5px] text-[12px]',
} as const;

const QUIET = 'border-[1.5px] border-line bg-transparent font-bold text-ink3';

export function MarkChip({
  mark,
  small = false,
  change,
}: {
  mark: Mark;
  small?: boolean;
  /** the teacher corrected this mark (the row says what it was) or removed it */
  change?: 'changed' | 'removed';
}) {
  const look = change
    ? `${QUIET} ${change === 'removed' ? 'line-through' : ''}`
    : mark.band
      ? FILL[mark.band]
      : 'bg-band-ok-bg text-band-ok-fg';
  return (
    <span
      className={`inline-flex flex-none items-center justify-center font-extrabold tabular-nums ${SIZE[small ? 'small' : 'normal']} ${look}`}
    >
      {mark.raw}
    </span>
  );
}

/** An absence in Оценки (design.md 5.3, D58): the diary's code («н») in a dashed frame; never a mark, never counted */
export function AbsenceChip({ code }: { code: string }) {
  return (
    <span
      className={`inline-flex flex-none items-center justify-center border-dashed ${SIZE.normal} ${QUIET} font-bold`}
    >
      {code}
    </span>
  );
}

/** The teacher's comment without a mark (D56) where marks are listed: a comment icon on a quiet tile, never a chip */
export function CommentChip() {
  return (
    <span className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-surface2 text-ink2">
      <CommentIcon size={16} />
    </span>
  );
}
