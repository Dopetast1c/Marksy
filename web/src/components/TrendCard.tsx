import { formatAverage, formatBandRange } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import type { Schemas } from '../api/client';
import { dateStyle, intlLocale, useT } from '../i18n';
import type { Kind } from '../lib/period';

// «Динамика» (ux-principles D26, docs/design.md 5.2, 5.4): one stacked bar per bucket of the selected kind (weeks,
// months, terms, the months of a year), marks stacked by band, worst at the bottom, the average line with its value
// over every point and the label under it; the selected instance is last and drawn solid. The same card on Главная
// (all marks) and on the subject screen (one subject).

type Bucket = Schemas['Trend']['buckets'][number];

const W = 320;
const H = 128;
const TOP = 16;
const BOTTOM = 20;
const PAD_X = 18;
const ORDER = ['critical', 'low', 'good', 'top'] as const;
// the range pills' colours: 7–8 soft green with its line, 9–10 deep green, so the two greens never read as one block
const FILL = {
  critical: 'var(--band-critical-fg)',
  low: 'var(--band-low-fg)',
  good: 'var(--band-good-bg)',
  top: 'var(--band-top-bg)',
} as const;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function bucketLabel(kind: Kind, b: Bucket, index: number): string {
  const day = b.from.slice(8, 10);
  const month = b.from.slice(5, 7);
  if (kind === 'week') return `${day}.${month}`;
  if (kind === 'term') return ROMAN[index] ?? String(index + 1);
  const ds = dateStyle();
  return (
    ds.months?.[Number(month) - 1] ??
    new Intl.DateTimeFormat(ds.locale, { timeZone: 'UTC', month: 'short' }).format(new Date(`${b.from}T12:00:00Z`))
  );
}

export function TrendCard({
  scale,
  kind,
  buckets,
  termKind = null,
}: {
  scale: GradingScale;
  kind: Kind;
  buckets: readonly Bucket[];
  /** what the child's terms are called, for «по четвертям» */
  termKind?: string | null;
}) {
  const t = useT();
  const locale = intlLocale();
  const n = buckets.length;
  const plotH = H - TOP - BOTTOM;
  const barMax = plotH * 0.72;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const slot = (W - PAD_X * 2) / Math.max(1, n);
  const barW = Math.min(26, slot * 0.6);
  const x = (i: number) => PAD_X + slot * (i + 0.5);
  const y = (v: number) => {
    const q = (v - scale.min) / (scale.max - scale.min);
    return TOP + (1 - (scale.higherIsBetter ? q : 1 - q)) * plotH;
  };
  const base = H - BOTTOM;
  const points = buckets.map((b, i) => (b.average == null ? null : ([x(i), y(b.average)] as const)));
  let path = '';
  let open = false;
  for (const pt of points) {
    if (!pt) {
      open = false;
      continue;
    }
    path += `${open ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)} `;
    open = true;
  }
  const any = buckets.some((b) => b.average != null);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{t('stat.trend')}</h2>
        <span className="text-small text-ink3">
          {t(`stat.trend.sub.${kind}`, {
            name: t(`term.${termKind ?? 'other'}.plural`).toLocaleLowerCase(locale),
          })}
        </span>
      </div>
      {any ? (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full overflow-visible"
            role="img"
            aria-label={t('stat.trend.label')}
          >
            {buckets.map((b, i) => {
              if (!b.count) return null;
              const unit = barMax / maxCount;
              let yTop = base;
              const cx = x(i) - barW / 2;
              return ORDER.map((role) => {
                const c = b.bands[role];
                if (!c) return null;
                const h = c * unit;
                yTop -= h;
                return (
                  <rect
                    key={`${i}-${role}`}
                    x={cx}
                    y={yTop}
                    width={barW}
                    height={Math.max(1.5, h - 1)}
                    rx={2}
                    fill={FILL[role]}
                    stroke={role === 'good' ? 'var(--band-good-fg)' : undefined}
                    strokeWidth={role === 'good' ? 1 : undefined}
                    opacity={b.selected ? 1 : 0.7}
                  />
                );
              });
            })}
            <path
              d={path.trim()}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity={0.8}
            />
            {buckets.map((b, i) => {
              const cx = x(i);
              const label = bucketLabel(kind, b, i);
              const cls = b.selected ? 'fill-accent' : 'fill-ink3';
              if (b.average == null)
                return (
                  <g key={i}>
                    {!b.future && (
                      <text x={cx} y={base - 4} textAnchor="middle" className="fill-ink3 text-[11px]">
                        –
                      </text>
                    )}
                    <text x={cx} y={H - 4} textAnchor="middle" className={`${cls} text-[10px] font-semibold`}>
                      {label}
                    </text>
                  </g>
                );
              const cy = y(b.average);
              return (
                <g key={i}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={b.selected ? 4.5 : 3}
                    fill={b.selected ? 'var(--ink)' : 'var(--surface)'}
                    stroke="var(--ink)"
                    strokeWidth={1.8}
                  />
                  <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    className={`${b.selected ? 'fill-accent' : 'fill-ink'} text-[10.5px] font-extrabold`}
                  >
                    {formatAverage(scale, b.average, locale)}
                  </text>
                  <text x={cx} y={H - 4} textAnchor="middle" className={`${cls} text-[10px] font-semibold`}>
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap justify-center gap-1.5">
            {ORDER.map((role) => {
              const range = formatBandRange(scale, role, locale);
              return range ? (
                <span key={role} className={`rounded-pill px-[7px] py-px text-[11px] font-extrabold ${PILL[role]}`}>
                  {range}
                </span>
              ) : null;
            })}
            <span className="self-center text-small text-ink3">{t('stat.trend.legend')}</span>
          </div>
        </>
      ) : (
        <span className="text-small text-ink3">{t('stat.trend.empty')}</span>
      )}
    </div>
  );
}

const PILL = {
  critical: 'bg-band-critical-bg text-band-critical-fg',
  low: 'bg-band-low-bg text-band-low-fg',
  good: 'bg-band-good-bg text-band-good-fg',
  top: 'bg-band-top-bg text-band-top-fg',
} as const;
