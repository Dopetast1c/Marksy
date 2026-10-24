import { bandOf, formatAverage, formatBandRange } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import type { ReactNode } from 'react';
import type { Schemas } from '../api/client';
import type { Overview } from '../api/queries';
import { intlLocale, useT } from '../i18n';
import { ChangeArrow } from './ChangeArrow';

// StatBlock (CLAUDE.md "One kind of information, one component", ux-principles principle 2, D5, D23): the average and
// the count with what they were in the instance before, and the band distribution. On Главная it is split: the two
// tiles under the navigator (StatTiles), the band card in Статистика (BandCard); the subject screen uses the same
// pieces. Every number comes from the API on the child's scale; formatting and band ranges from core's grading.
//
// Missing data is a state, never a zero (D23): no arrow without two real values; "—" for no marks; "было 0" is hidden.

type Comparison = Schemas['Comparison'];
type Band = Schemas['BandCount'];

const BAND_TEXT = {
  critical: 'text-band-critical-fg',
  low: 'text-band-low-fg',
  good: 'text-band-good-fg',
  top: 'text-band-top-fg-text',
} as const;
const BAND_PILL = {
  critical: 'bg-band-critical-bg text-band-critical-fg',
  low: 'bg-band-low-bg text-band-low-fg',
  good: 'bg-band-good-bg text-band-good-fg',
  top: 'bg-band-top-bg text-band-top-fg',
} as const;
const BAND_BAR = {
  critical: 'bg-band-critical-fg',
  low: 'bg-band-low-fg',
  good: 'bg-band-good-fg',
  top: 'bg-band-top-bg',
} as const;

function Tile({ label, value, tone, hint }: { label: string; value: ReactNode; tone: string; hint?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface px-3.5 py-3 shadow-card">
      <span className="text-label text-ink3 uppercase">{label}</span>
      <span className={`font-display text-tile ${tone}`}>{value}</span>
      <span className="min-h-4 text-[12px] text-ink3">{hint}</span>
    </div>
  );
}

const was = (text: string) => <b className="font-bold text-ink2">{text}</b>;

/** The two tiles of the brief row: Средний балл and Оценок, each with "было" */
export function StatTiles({
  scale,
  comparison,
  count,
  prevCount,
}: {
  scale: GradingScale;
  comparison: Comparison | null;
  count: number;
  prevCount: number | null;
}) {
  const t = useT();
  const locale = intlLocale();
  const cur = comparison?.current === 'marks';
  const prev = comparison?.previous === 'marks';
  const avg = cur ? (comparison?.average ?? null) : null;
  const band = bandOf(scale, avg);
  const prevText = comparison?.prevAverage != null ? formatAverage(scale, comparison.prevAverage, locale) : '';
  const avgHint = cur ? (
    prev ? (
      was(t('stat.was', { value: prevText }))
    ) : comparison?.previous === 'empty' ? (
      t('stat.prevEmpty')
    ) : null
  ) : prev ? (
    <>
      {t('stat.noneYet')} · {was(t('stat.was', { value: prevText }))}
    </>
  ) : (
    t('stat.none')
  );
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile
        label={t('stat.average')}
        tone={band ? BAND_TEXT[band] : 'text-ink3'}
        value={
          <>
            {cur ? formatAverage(scale, avg, locale) : '—'}
            {cur && prev && <ChangeArrow delta={comparison?.delta ?? null} trend={comparison?.trend ?? null} />}
          </>
        }
        hint={avgHint}
      />
      <Tile
        label={t('stat.count')}
        tone={count ? 'text-ink' : 'text-ink3'}
        value={
          <>
            {count}
            {cur && prev && prevCount != null && (
              <ChangeArrow
                delta={count - prevCount}
                trend={count > prevCount ? 'up' : count < prevCount ? 'down' : 'flat'}
              />
            )}
          </>
        }
        hint={prev && prevCount != null ? was(t('stat.was', { value: String(prevCount) })) : null}
      />
    </div>
  );
}

/** The two tiles of a year without marks (D49): Уроков and Заданий, with "было" */
export function LessonTiles({ tiles }: { tiles: NonNullable<Overview['lessonTiles']> }) {
  const t = useT();
  const tile = (label: string, v: number, p: number | null) => (
    <Tile
      label={label}
      tone={v ? 'text-ink' : 'text-ink3'}
      value={v}
      hint={p != null ? was(t('stat.was', { value: String(p) })) : null}
    />
  );
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tile(t('stat.lessons'), tiles.lessons, tiles.prevLessons)}
      {tile(t('stat.homework'), tiles.homework, tiles.prevHomework)}
    </div>
  );
}

/** «По градациям»: four fixed rows per column (range, count with arrow, bar, "было"), the ranges always on one line */
export function BandCard({
  scale,
  bands,
  comparison,
  absences,
  prevAbsences,
}: {
  scale: GradingScale;
  bands: readonly Band[];
  comparison: Comparison | null;
  absences: number | null;
  prevAbsences: number | null;
}) {
  const t = useT();
  const locale = intlLocale();
  const total = bands.reduce((n, b) => n + b.count, 0);
  const both = comparison?.current === 'marks' && comparison.previous === 'marks';
  const hasPrev = comparison?.previous === 'marks';
  const cell = (
    key: string,
    pill: ReactNode,
    n: number,
    p: number | null,
    tone: string,
    bar: string,
    goodIsUp: boolean,
    arrows: boolean,
  ) => (
    <div key={key} className="grid min-w-0 grid-rows-[18px_30px_28px_14px] items-end justify-items-center gap-y-[3px]">
      {pill}
      <span className={`font-display text-[24px] leading-[1.1] font-semibold ${n ? tone : 'text-ink3'}`}>
        {n}
        {arrows && p != null && (n || p) ? (
          <ChangeArrow delta={n - p} trend={n === p ? 'flat' : n > p === goodIsUp ? 'up' : 'down'} />
        ) : null}
      </span>
      <span className="flex h-7 w-full items-end justify-center">
        <i
          className={`block w-full max-w-[18px] rounded-t-[4px] ${bar}`}
          style={{ height: total ? Math.max(3, Math.round((n / total) * 28)) : 3 }}
        />
      </span>
      <span className="text-[11px] font-semibold text-ink3">
        {hasPrev && p != null && (n || p) ? t('stat.was', { value: String(p) }) : ''}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{t('stat.bands')}</h2>
        <span className="text-small text-ink3">{t('stat.bands.sub')}</span>
      </div>
      <div className="grid auto-cols-fr grid-flow-col items-start gap-2 pt-1">
        {bands.map((b) => {
          const range = formatBandRange(scale, b.band, locale) ?? '';
          const pill = (
            <span
              className={`self-start rounded-pill px-[7px] py-px text-[11px] font-extrabold whitespace-nowrap ${BAND_PILL[b.band]}`}
            >
              {range}
            </span>
          );
          return cell(
            b.band,
            pill,
            b.count,
            b.prevCount,
            BAND_TEXT[b.band],
            BAND_BAR[b.band],
            b.band === 'good' || b.band === 'top',
            both,
          );
        })}
        {absences != null &&
          cell(
            'absences',
            <span className="self-start rounded-pill bg-surface2 px-[7px] py-px text-[11px] font-extrabold text-ink2">
              {t('stat.absencesShort')}
            </span>,
            absences,
            prevAbsences,
            'text-band-low-fg',
            'bg-line',
            false,
            prevAbsences != null,
          )}
      </div>
    </div>
  );
}
