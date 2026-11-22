import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react';
import { Button } from '../../components/Field';
import { intlLocale, useT } from '../../i18n';
import {
  anchor,
  clampView,
  coverView,
  dragSoft,
  maxZoom,
  outputRect,
  panBy,
  scaleOf,
  sliderToZoom,
  zoomAt,
  zoomToSlider,
} from '../../lib/crop';
import type { Point, View } from '../../lib/crop';
import { loadPhoto, squareAvatar } from '../../lib/photo';
import type { Source } from '../../lib/photo';

// The crop step of a child's photo avatar (docs/design.md 5.6, ux-principles D62), inside a sheet that is a dialog on a
// wide screen. The photo sits under a dimmed square with a round cut-out: the circle is exactly what the avatar shows.
// One finger or the mouse moves it, two fingers, the wheel, a trackpad or the slider zoom it around the point under
// them; the keyboard does both (arrows, + and −), Enter is "Done" (crop.done), Esc "Cancel" (crop.cancel, the sheet's
// own). The math is lib/crop.ts; nothing leaves the browser but the square drawn on "Done".

/** The circle's diameter as a share of the editor's side: the dimmed rest shows what is cut off */
const RING = 0.84;
/** The editor's side before it is measured (and in tests, where nothing has a size) */
const FALLBACK_SIDE = 300;
/** The preview: the avatar as the student bar shows it (StudentAvatar's default size) */
const PREVIEW_PX = 34;
/** An arrow key moves the photo this many CSS px, with Shift four times as far */
const KEY_STEP = 12;
/** One + or − press */
const ZOOM_STEP = 1.2;
const SLIDER_STEPS = 1000;

const R = (RING * 100) / 2;
const CUTOUT = `M0 0H100V100H0Z M50 ${50 - R}A${R} ${R} 0 1 0 50 ${50 + R}A${R} ${R} 0 1 0 50 ${50 - R}Z`;

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function release(src: Source | null) {
  if (src && typeof ImageBitmap !== 'undefined' && src.image instanceof ImageBitmap) src.image.close();
}

export function PhotoCrop({
  file,
  busy,
  error,
  onPick,
  onCancel,
  onDone,
}: {
  file: File;
  busy: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onCancel: () => void;
  onDone: (photo: Blob) => void;
}) {
  const t = useT();
  const hint = useId();
  const [src, setSrc] = useState<Source | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, cx: 0, cy: 0 });
  const [side, setSide] = useState(FALLBACK_SIDE);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  // the latest view for the handlers between renders (a pointer move, the wheel, the settling animation)
  const current = useRef(view);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; points: Point[] } | null>(null);
  const settling = useRef(0);

  const d = side * RING;
  const zmax = src ? maxZoom(src) : 1;
  const put = (v: View) => {
    current.current = v;
    setView(v);
  };

  // the picked file, upright and no larger than needed, let go on unmount (another file is another mount: the caller
  // keys this component by the pick)
  useEffect(() => {
    let live = true;
    let loaded: Source | null = null;
    loadPhoto(file).then(
      (s) => {
        loaded = s;
        if (!live) return release(s);
        current.current = coverView(s);
        setView(current.current);
        setSrc(s);
      },
      () => live && setProblem(t('crop.unreadable')),
    );
    return () => {
      live = false;
      release(loaded);
    };
  }, [file, t]);

  // focused as soon as the photo is there, so that the arrows move it at once (the file picker has given the focus
  // back to its own field by then)
  useEffect(() => {
    if (src) box.current?.focus();
  }, [src]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setSide(el.getBoundingClientRect().width || FALLBACK_SIDE);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the editor and the preview, in device pixels
  useEffect(() => {
    if (!src) return;
    const dpr = window.devicePixelRatio || 1;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      const px = Math.round(side * dpr);
      if (c.width !== px) c.width = c.height = px;
      const s = scaleOf(src, d, view.zoom) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, px, px);
      ctx.setTransform(s, 0, 0, s, px / 2 - view.cx * s, px / 2 - view.cy * s);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.image, 0, 0);
    }
    const p = preview.current;
    const pctx = p?.getContext('2d');
    if (p && pctx) {
      const px = Math.round(PREVIEW_PX * dpr);
      if (p.width !== px) p.width = p.height = px;
      const r = outputRect(view, src);
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(src.image, r.x, r.y, r.side, r.side, 0, 0, px, px);
    }
  }, [src, view, side, d]);

  /** A point of the event in CSS px from the circle's centre */
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = box.current?.getBoundingClientRect();
    const w = r?.width || side;
    const h = r?.height || side;
    return { x: e.clientX - (r?.left ?? 0) - w / 2, y: e.clientY - (r?.top ?? 0) - h / 2 };
  };

  // the wheel and a trackpad pinch (a wheel with ctrlKey) zoom around the cursor; the page must not scroll meanwhile,
  // so the listener is not passive
  useEffect(() => {
    const el = box.current;
    if (!el || !src) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (busy) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? side : 1;
      const k = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
      const v = clampView(current.current, src, zmax);
      put(zoomAt(v, src, d, v.zoom * k, local(e), zmax));
    };
    // Safari on a Mac pinches with gesture events instead; on a phone the same pinch also arrives as two pointers,
    // which already zoom, so the gesture only zooms when no pointer is down. Either way the page itself must not zoom.
    let base = 1;
    const gesture = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      if (e.type === 'gesturestart') base = current.current.zoom;
      else if (!pointers.current.size) {
        put(zoomAt(clampView(current.current, src, zmax), src, d, base * g.scale, local(g), zmax));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    for (const type of ['gesturestart', 'gesturechange']) el.addEventListener(type, gesture, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheel);
      for (const type of ['gesturestart', 'gesturechange']) el.removeEventListener(type, gesture);
    };
  });

  useEffect(() => () => cancelAnimationFrame(settling.current), []);

  /** After a drag past the edge, back inside it */
  const settle = () => {
    if (!src) return;
    const from = current.current;
    const to = clampView(from, src, zmax);
    if (from.cx === to.cx && from.cy === to.cy && from.zoom === to.zoom) return;
    if (typeof requestAnimationFrame !== 'function') return put(to);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 160);
      const e = 1 - (1 - k) ** 3;
      put({ zoom: to.zoom, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e });
      if (k < 1) settling.current = requestAnimationFrame(step);
    };
    settling.current = requestAnimationFrame(step);
  };

  const begin = () => {
    gesture.current = { view: current.current, points: [...pointers.current.values()] };
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!src || busy) return;
    cancelAnimationFrame(settling.current);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    begin();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!src || !g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && g.points.length === 1) {
      put(dragSoft(g.view, src, d, pts[0]!.x - g.points[0]!.x, pts[0]!.y - g.points[0]!.y));
    } else if (pts.length >= 2 && g.points.length >= 2) {
      const [a, b] = pts as [Point, Point];
      const [a0, b0] = g.points as [Point, Point];
      const start = clampView(g.view, src, zmax);
      put(anchor(start, src, d, mid(a0, b0), mid(a, b), start.zoom * (dist(a, b) / Math.max(1, dist(a0, b0))), zmax));
    }
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size) return begin();
    gesture.current = null;
    settle();
  };

  const zoomBy = (k: number) => {
    if (!src) return;
    const v = clampView(current.current, src, zmax);
    put(zoomAt(v, src, d, v.zoom * k, { x: 0, y: 0 }, zmax));
  };
  const done = async () => {
    if (!src || busy) return;
    try {
      onDone(await squareAvatar(src, outputRect(current.current, src)));
    } catch {
      // the browser could not draw this picture: another photo is the way out, not the connection
      setProblem(t('crop.unreadable'));
    }
  };

  const arrows = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP * (e.shiftKey ? 4 : 1);
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!by || !src || busy) return;
    e.preventDefault();
    put(panBy(clampView(current.current, src, zmax), src, d, by[0]!, by[1]!, zmax));
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    // while the square is being sent, what is on screen is what goes
    if (busy) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (e.key === 'Enter') {
      // a button keeps its own Enter ("Cancel" cancels); the file picker's label too
      const el = e.target as HTMLElement;
      if (el.closest('button, label')) return;
      e.preventDefault();
      void done();
    }
  };

  const shown = src ? clampView(view, src, zmax) : view;
  const percent = new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 });
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    e.target.value = '';
    if (next) onPick(next);
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={keys}>
      <h2 className="m-0 text-h2">{t('crop.title')}</h2>
      {/* an application region: a screen reader in browse mode passes the arrows and + − to it. On a phone the box
          shrinks with the screen's height, so that "Done" (crop.done) stays on screen at 360 × 640 */}
      <div
        ref={box}
        role="application"
        tabIndex={0}
        aria-label={t('crop.area')}
        aria-describedby={hint}
        onKeyDown={arrows}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative mx-auto aspect-square w-full max-w-[min(320px,calc(88svh_-_270px))] min-w-[180px] cursor-grab touch-none overflow-hidden rounded-md bg-surface2 outline-none select-none focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
      >
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
        <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
          <path d={CUTOUT} fillRule="evenodd" className="fill-crop-scrim" />
          <circle
            cx="50"
            cy="50"
            r={R}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="fill-none stroke-crop-ring"
          />
        </svg>
        {!src && (
          <span
            role={problem ? 'alert' : undefined}
            className="absolute inset-0 grid place-items-center p-6 text-center text-small font-semibold text-ink2"
          >
            {problem ?? t('app.loading')}
          </span>
        )}
      </div>
      {/* how to use it: read out on every screen, shown where there is room (a phone's sheet keeps the buttons) */}
      <p id={hint} className="m-0 text-small text-ink3 max-sm:sr-only">
        {t('crop.hint')}
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={Math.round(zoomToSlider(shown.zoom, zmax) * SLIDER_STEPS)}
          aria-label={t('crop.zoom')}
          aria-valuetext={percent.format(shown.zoom)}
          disabled={!src || zmax <= 1 || busy}
          onChange={(e) => {
            if (!src) return;
            const v = clampView(current.current, src, zmax);
            put(zoomAt(v, src, d, sliderToZoom(Number(e.target.value) / SLIDER_STEPS, zmax), { x: 0, y: 0 }, zmax));
          }}
          className="min-h-11 flex-1 accent-[var(--accent)]"
        />
        <canvas
          ref={preview}
          role="img"
          aria-label={t('crop.preview')}
          title={t('crop.preview')}
          className="block size-[34px] shrink-0 rounded-pill bg-surface2"
        />
      </div>
      {(error ?? (src ? problem : null)) && (
        <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
          {error ?? problem}
        </p>
      )}
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md text-[13px] font-extrabold text-accent">
        {t('crop.another')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={pick}
          disabled={busy}
        />
      </label>
      <div className="flex gap-2">
        <Button ghost onClick={onCancel} disabled={busy}>
          {t('crop.cancel')}
        </Button>
        <Button onClick={() => void done()} disabled={!src || busy}>
          {t('crop.done')}
        </Button>
      </div>
    </div>
  );
}
