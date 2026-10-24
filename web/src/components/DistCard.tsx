import { bandOf, formatValue } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { intlLocale, useT } from '../i18n';

// «Распределение» (docs/design.md 5.2, 5.4): one bar per value of the child's scale with the count above every non-
// empty bar, the same card on Главная and on the subject screen. The bar takes its value's band colour; the value is
// written under it, so colour is never the only signal.

const BAR = {
  critical: 'bg-band-critical-fg',
  low: 'bg-band-low-fg',
  good: 'bg-band-good-fg',
  top: 'bg-band-top-bg',
} as const;

export function DistCard({
  scale,
  buckets,
}: {
  scale: GradingScale;
  buckets: readonly { from: number; to: number; count: number }[];
}) {
  const t = useT();
  const locale = intlLocale();
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{t('stat.distribution')}</h2>
        <span className="text-small text-ink3">{t('stat.distribution.sub')}</span>
      </div>
      <div
        className="grid h-20 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
      >
        {buckets.map((b) => {
          const band = bandOf(scale, b.from);
          return (
            <div key={b.from} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="min-h-[13px] text-[11px] leading-[13px] font-extrabold text-ink2 tabular-nums">
                {b.count || ''}
              </span>
              <i
                className={`block w-full max-w-[18px] rounded-t-[4px] ${b.count ? (band ? BAR[band] : 'bg-band-ok-fg') : 'bg-line'}`}
                style={{ height: b.count ? Math.max(6, Math.round((b.count / max) * 44)) : 2 }}
              />
              <b className="text-[11px] font-bold text-ink3 tabular-nums">{formatValue(scale, b.from, locale)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
