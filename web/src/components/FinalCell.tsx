import { bandOf } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import type { FinalCell } from '../api/queries';
import { MarkChip } from './MarkChip';
import { numbers } from '../lib/numbers';

// A cell of Итоги and of the subject's «По четвертям» (docs/design.md 5.3b, 5.4): the teacher's final as a filled chip;
// a calculation (the running term's average, the year by the scale's year rule) as an italic decimal with no fill, so
// it is never read as a mark; a dash where there is nothing yet.

const LIVE = {
  critical: 'text-band-critical-fg',
  low: 'text-band-low-fg',
  good: 'text-band-good-fg',
  top: 'text-band-top-fg-text',
} as const;

export function FinalCellView({ cell, scale }: { cell: FinalCell; scale: GradingScale | null }) {
  if (cell.kind === 'final' && cell.raw != null) {
    const band = scale && cell.value != null ? bandOf(scale, cell.value) : null;
    return (
      <span className="flex justify-center">
        <MarkChip
          mark={{ id: '', values: cell.value == null ? [] : [cell.value], raw: cell.raw, kind: 'numeric', band }}
        />
      </span>
    );
  }
  if (cell.kind === 'running' && cell.value != null && scale) {
    const band = bandOf(scale, cell.value);
    return (
      <span className={`text-center text-[13px] font-semibold italic tabular-nums ${band ? LIVE[band] : 'text-ink2'}`}>
        {numbers(scale).average(cell.value)}
      </span>
    );
  }
  return <span className="text-center font-semibold text-ink3">–</span>;
}
