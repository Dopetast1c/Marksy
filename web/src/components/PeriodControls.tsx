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
// (Week / Month / Quarter / Year: period.week, period.month, term.*, period.year; the term word from the child's term
// kind), PeriodNav steps through instances. The
// navigator is the first line of the body and the only sticky element; it owns the swipe over the body
// ([data-swipe-body]). The kind and offset are shared by every screen and survive a child switch. Timetable uses the
// same two controls with its own kinds and instances (days and weeks that also go forward, D2).

/** The kind control: the marks screens pass the child, Timetable its own kinds (Day / Week: schedule.day, period.week) */
export function PeriodBar(props: { studentId: string } | { model: KindModel }) {
  if ('model' in props) {
    const { model } = props;
    return (
      <SegmentedControl label={model.label} value={model.value} onChange={model.onChange} options={model.options} />
    );
  }
  return <MarksPeriodBar studentId={props.studentId} />;
}

export interface KindModel {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function MarksPeriodBar({ studentId }: { studentId: string }) {
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

/** The short slide of the content when the period steps (base.css); restarted on every step */
function slide(el: HTMLElement | null, from: 'older' | 'newer') {
  if (!el) return;
  delete el.dataset.slide;
  void el.offsetWidth;
  el.dataset.slide = from;
  window.clearTimeout(Number(el.dataset.slideTimer));
  el.dataset.slideTimer = String(window.setTimeout(() => delete el.dataset.slide, 400));
}

/** One instance in the navigator's picker */
export interface NavOption {
  key: string;
  title: string;
  sub?: string;
  value?: string;
  selected: boolean;
  onSelect: () => void;
}

/**
 * What a navigator shows and does, whoever owns the period: the marks screens (the shared period store) or Timetable
 * (days and weeks that also go forward, D2)
 */
export interface NavModel {
  title: string;
  sub: string;
  olderOk: boolean;
  newerOk: boolean;
  /** +1 older (finger to the right), -1 newer */
  step: (delta: 1 | -1) => void;
  sheet: { label: string; options: NavOption[]; note?: string };
}

type MarksNavProps = {
  studentId: string;
  compare?: boolean;
  /** the subject screen (D45): the row continues the tinted header, rounded below, tinted while sticky */
  accent?: CSSProperties;
};

/** The navigator of a period screen: the marks screens pass the child, Timetable passes its own model */
export function PeriodNav(props: MarksNavProps | { model: NavModel | null }) {
  return 'model' in props ? <NavRow model={props.model} /> : <MarksPeriodNav {...props} />;
}

function MarksPeriodNav({ studentId, compare = false, accent }: MarksNavProps) {
  const t = useT();
  const ds = dateStyle();
  const periods = usePeriods(studentId);
  const { kind, offset, step, setOffset } = usePeriod();
  const list = useMemo(() => periods.data?.instances[kind] ?? [], [periods.data, kind]);
  const current = list.find((i) => i.offset === offset) ?? list[0];

  // an offset the new kind or child does not have: the oldest one it has
  useEffect(() => {
    if (list.length && !list.some((i) => i.offset === offset)) setOffset(list[list.length - 1]!.offset);
  }, [list, offset, setOffset]);

  if (!current) return <NavRow model={null} />;
  const sub = instanceSub(t, current, ds);
  const label = t('period.pick', { kind: kindLabel(t, kind as Kind, current.termKind) });
  const model: NavModel = {
    title: instanceTitle(t, current, ds),
    sub: compare ? t('period.withCompare', { what: sub, compare: comparedWith(t, list, current, ds) }) : sub,
    olderOk: list.some((i) => i.offset === offset + 1),
    newerOk: offset > 0,
    step,
    sheet: {
      label,
      note: t('period.pickNote'),
      options: list.map((i) => ({
        key: String(i.offset),
        title: instanceTitle(t, i, ds),
        sub: instanceSub(t, i, ds),
        value:
          periods.data?.counts === 'lessons'
            ? i.count
              ? t('lessons.count', { count: i.count })
              : t('period.noLessons')
            : i.count
              ? t('marks.count', { count: i.count })
              : t('period.noMarks'),
        selected: i.offset === offset,
        onSelect: () => setOffset(i.offset),
      })),
    },
  };
  return <NavRow model={model} accent={accent} />;
}

/**
 * The row itself: ‹ label › with the picker behind the label; the first line of the body and the only sticky element.
 * It owns the swipe over the body ([data-swipe-body]) and the short slide on a step.
 */
function NavRow({ model, accent }: { model: NavModel | null; accent?: CSSProperties }) {
  const t = useT();
  const [sheet, setSheet] = useState(false);
  const nav = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    body.current = nav.current?.closest<HTMLElement>('[data-swipe-body]') ?? null;
  });
  const go = (delta: 1 | -1) => {
    if (!model || !((delta === 1 && model.olderOk) || (delta === -1 && model.newerOk))) return;
    model.step(delta);
    slide(body.current, delta === 1 ? 'older' : 'newer');
  };
  useSwipe(body, go);

  if (!model) return <div ref={nav} className="h-[50px]" />;
  return (
    <div
      ref={nav}
      data-period-nav
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
        disabled={!model.olderOk}
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
        <b className="text-[15px]">{model.title}</b>
        <span className="text-[12px] text-ink3">{model.sub}</span>
      </button>
      <button
        type="button"
        aria-label={t('period.newer')}
        disabled={!model.newerOk}
        onClick={() => go(-1)}
        className={`${accent ? 'text-accent' : 'text-ink2'} relative grid size-[34px] flex-none place-items-center rounded-pill bg-surface shadow-card after:absolute after:-inset-[5px] disabled:opacity-30`}
      >
        <BackIcon size={18} className="rotate-180" />
      </button>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={model.sheet.label}>
        <span className="text-label text-ink3 uppercase">{model.sheet.label}</span>
        {model.sheet.options.map((o) => (
          <SheetOption
            key={o.key}
            title={o.title}
            sub={o.sub}
            value={o.value}
            selected={o.selected}
            onSelect={() => {
              o.onSelect();
              setSheet(false);
            }}
          />
        ))}
        {model.sheet.note && <span className="text-small text-ink3">{model.sheet.note}</span>}
      </BottomSheet>
    </div>
  );
}
