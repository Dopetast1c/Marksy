import type { Schemas } from '../api/client';

// A mark (ux-principles principle 5, D3): the raw mark as the diary wrote it, on the band's fill; colour is never the
// only signal, the value is always on the chip. Non-numeric kinds (зач., осв.) use the neutral style, an absence a
// dashed outline. The test pencil comes with the tag «Контрольная» (M6).

export type Mark = Schemas['MarkChip'];

const FILL = {
  critical: 'bg-band-critical-bg text-band-critical-fg',
  low: 'bg-band-low-bg text-band-low-fg',
  good: 'bg-band-good-bg text-band-good-fg',
  top: 'bg-band-top-bg text-band-top-fg',
} as const;

export function MarkChip({ mark, small = false }: { mark: Mark; small?: boolean }) {
  const absent = mark.kind.toUpperCase() === 'ABSENT';
  const look = absent
    ? 'border-[1.5px] border-dashed border-line bg-transparent font-bold text-ink3'
    : mark.band
      ? FILL[mark.band]
      : 'bg-band-ok-bg text-band-ok-fg';
  const size = small
    ? 'h-6 min-w-6 rounded-[7px] px-[5px] text-[12px]'
    : 'h-[30px] min-w-[30px] rounded-[9px] px-[7px] text-[14px]';
  return (
    <span className={`inline-flex flex-none items-center justify-center font-extrabold tabular-nums ${size} ${look}`}>
      {mark.raw}
    </span>
  );
}

/** An absence where marks are listed (Оценки, D23): the diary's code («н») in a dashed frame; never a mark, never counted */
export function AbsenceChip({ code }: { code: string }) {
  return (
    <span className="inline-flex h-[30px] min-w-[30px] flex-none items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-line px-[7px] text-[14px] font-bold text-ink3">
      {code}
    </span>
  );
}
