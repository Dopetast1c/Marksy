import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { usePeriods } from '../api/queries';
import { useSwipe } from '../hooks/useSwipe';
import { dateStyle, useT } from '../i18n';
import { comparedWith, instanceSub, instanceTitle, kindLabel } from '../lib/period';
import type { Kind } from '../lib/period';
import { usePeriod } from '../state/store';
import { BottomSheet, SheetOption } from './BottomSheet';
import { BackIcon } from './icons';
import { SegmentedControl } from './SegmentedControl';

// The period control of every period screen (docs/design.md 6, ux-principles D2): PeriodBar picks the kind
// (Неделя / Месяц / Четверть / Год, the term word from the child's term kind), PeriodNav steps through instances. The
// navigator is the first line of the body and the only sticky element; it owns the swipe over the body
// ([data-swipe-body]). The kind and offset are shared by every screen and survive a child switch.

export function PeriodBar({ studentId }: { studentId: string }) {
  const t = useT();
  const periods = usePeriods(studentId);
  const kind = usePeriod((s) => s.kind);
  const setKind = usePeriod((s) => s.setKind);
  const kinds = useMemo(() => (periods.data?.kinds ?? ['week', 'month', 'year']) as Kind[], [periods.data]);
  const termKind = periods.data?.instances.term?.[0]?.termKind ?? null;
  // a child without terms (or a kind the other child had): back to the default kind
  useEffect(() => {
    if (periods.data && !kinds.includes(kind)) setKind('week');
  }, [periods.data, kinds, kind, setKind]);
  // until the child's kinds are known, an empty strip of the same height: the control never jumps from 3 to 4
  if (!periods.data) return <div className="h-[39px] rounded-pill bg-surface2" />;
  return (
    <SegmentedControl
      label={t('period.kind')}
      value={kind}
      onChange={setKind}
      options={kinds.map((k) => ({ value: k, label: kindLabel(t, k, termKind) }))}
    />
  );
}

export function PeriodNav({
  studentId,
  compare = false,
  accent,
}: {
  studentId: string;
  compare?: boolean;
  /** the subject screen (D45): the row continues the tinted header, rounded below, tinted while sticky */
  accent?: CSSProperties;
}) {
  const t = useT();
  const ds = dateStyle();
  const periods = usePeriods(studentId);
  const { kind, offset, step, setOffset } = usePeriod();
  const [sheet, setSheet] = useState(false);
  const nav = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    body.current = nav.current?.closest<HTMLElement>('[data-swipe-body]') ?? null;
  });

  const list = useMemo(() => periods.data?.instances[kind] ?? [], [periods.data, kind]);
  const current = list.find((i) => i.offset === offset) ?? list[0];
  const olderOk = list.some((i) => i.offset === offset + 1);
  const newerOk = offset > 0;
  const go = (delta: 1 | -1) => {
    if ((delta === 1 && olderOk) || (delta === -1 && newerOk)) step(delta);
  };
  useSwipe(body, go);

  // an offset the new kind or child does not have: the oldest one it has
  useEffect(() => {
    if (list.length && !list.some((i) => i.offset === offset)) setOffset(list[list.length - 1]!.offset);
  }, [list, offset, setOffset]);

  if (!current) return <div ref={nav} className="h-[50px]" />;
  const sub = instanceSub(t, current, ds);
  return (
    <div
      ref={nav}
      style={accent}
      className={`sticky top-0 z-[5] -mx-5 flex items-center gap-1.5 px-5 ${
        accent
          ? 'subject-accent mb-1 rounded-b-[24px] bg-subject-tint pt-0 pb-3'
          : 'bg-bg pt-1.5 pb-2 after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-2.5 after:h-2.5 after:bg-linear-to-b after:from-bg after:to-transparent'
      }`}
    >
      <button
        type="button"
        aria-label={t('period.older')}
        disabled={!olderOk}
        onClick={() => go(1)}
        className={`${accent ? 'text-accent' : 'text-ink2'} relative grid size-[34px] flex-none place-items-center rounded-pill bg-surface shadow-card after:absolute after:-inset-[5px] disabled:opacity-30`}
      >
        <BackIcon size={18} />
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setSheet(true)}
        className="flex flex-1 flex-col items-center rounded-md px-1.5 py-0.5 leading-[1.2]"
      >
        <b className="text-[15px]">{instanceTitle(t, current, ds)}</b>
        <span className="text-[12px] text-ink3">
          {compare ? t('period.withCompare', { what: sub, compare: comparedWith(t, list, current, ds) }) : sub}
        </span>
      </button>
      <button
        type="button"
        aria-label={t('period.newer')}
        disabled={!newerOk}
        onClick={() => go(-1)}
        className={`${accent ? 'text-accent' : 'text-ink2'} relative grid size-[34px] flex-none place-items-center rounded-pill bg-surface shadow-card after:absolute after:-inset-[5px] disabled:opacity-30`}
      >
        <BackIcon size={18} className="rotate-180" />
      </button>
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        label={t('period.pick', { kind: kindLabel(t, kind as Kind, current.termKind) })}
      >
        <span className="text-label text-ink3 uppercase">
          {t('period.pick', { kind: kindLabel(t, kind as Kind, current.termKind) })}
        </span>
        {list.map((i) => (
          <SheetOption
            key={i.offset}
            title={instanceTitle(t, i, ds)}
            sub={instanceSub(t, i, ds)}
            value={
              periods.data?.counts === 'lessons'
                ? i.count
                  ? t('lessons.count', { count: i.count })
                  : t('period.noLessons')
                : i.count
                  ? t('marks.count', { count: i.count })
                  : t('period.noMarks')
            }
            selected={i.offset === offset}
            onSelect={() => {
              setOffset(i.offset);
              setSheet(false);
            }}
          />
        ))}
        <span className="text-small text-ink3">{t('period.pickNote')}</span>
      </BottomSheet>
    </div>
  );
}
