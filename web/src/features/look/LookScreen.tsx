import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import type { Schemas } from '../../api/client';
import { meKey, useMe, useSubjects } from '../../api/queries';
import type { SubjectInfo } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { useContinueChild } from '../../app/guards';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Field';
import { BackIcon, CheckIcon, PlusIcon } from '../../components/icons';
import { ListCard, Note, Row, SectionHeader, Stripe } from '../../components/Section';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useT } from '../../i18n';
import { fontFamily, loadFont } from '../../lib/fonts';
import { subjectStyle } from '../../lib/subject-color';
import { SubjectColorGrid } from '../subjects/SubjectSettings';

// Оформление (docs/design.md 5.6a, D46): personal, saved to the person and applied on every device they sign in on.
// Тема and Фон: a palette (it changes only the page and the accent) or a wallpaper (five notebook patterns or an own
// picture, with how much it shows between the cards); one of five body fonts, each shown in itself; and the subjects'
// colours, which are the family's (6.6) and only listed here. Every change applies at once.

type Appearance = Schemas['Appearance'];
type Look = Omit<Appearance, 'hasOwnWallpaper'>;

const PALETTES = ['sea', 'forest', 'sky', 'plum', 'berry', 'amber', 'mint', 'graphite'] as const;
const WALLPAPERS = ['cell', 'line', 'dots', 'doodle', 'waves'] as const;
const FONTS = ['manrope', 'nunito', 'ptsans', 'inter', 'rubik'] as const;

/** The line under «Оформление» in Ещё: theme · palette or wallpaper · font */
export function lookSummary(t: ReturnType<typeof useT>, a: Appearance): string {
  return [
    t(`look.theme.${a.theme}`),
    a.background === 'color'
      ? t('look.summary.palette', { name: t(`look.palette.${a.palette}`) })
      : t('look.summary.wallpaper', { name: t(`look.wallpaper.${a.wallpaper}`) }),
    t(`look.font.${a.font}`),
  ].join(' · ');
}

/** A picture no larger than 1600 px on its longer side, as a JPEG, drawn on a canvas: the wallpaper the server is sent */
async function scaledJpeg(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), 'image/jpeg', 0.85));
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold text-ink2">{label}</span>
      {children}
    </div>
  );
}

/** A tile of the palette and wallpaper grids: a sample, its name under it */
function Tile({
  pressed,
  onClick,
  wide,
  sample,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  wide?: boolean;
  sample: { className?: string; style?: CSSProperties; children?: ReactNode; swatch?: string };
  label: string;
}) {
  const ring = pressed ? 'border-accent ring-2 ring-accent' : 'border-line';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-1.5 text-[12px] font-bold text-ink2"
    >
      <span
        data-swatch={sample.swatch}
        className={`relative grid place-items-center overflow-hidden border-2 ${ring} ${wide ? 'h-[72px] w-full rounded-[14px] bg-bg' : 'size-[52px] rounded-[16px]'} ${sample.className ?? ''}`}
        style={sample.style}
      >
        {sample.children}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

export function LookScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const me = useMe();
  const a = me.data?.user.appearance;
  const [opacity, setOpacity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the font samples are shown in their own faces
  useEffect(() => FONTS.forEach(loadFont), []);

  const save = async (patch: Partial<Look>) => {
    setError(null);
    // at once on this screen and on the page, then from the server
    queries.setQueryData(meKey, (old: typeof me.data) =>
      old ? { ...old, user: { ...old.user, appearance: { ...old.user.appearance, ...patch } } } : old,
    );
    try {
      await data(api.PATCH('/api/me/settings', { body: { appearance: patch } }));
    } catch {
      setError(t('look.error'));
    }
    await queries.invalidateQueries({ queryKey: meKey });
  };
  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void (async () => {
      setError(null);
      try {
        const res = await fetch('/api/me/wallpaper', {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: await scaledJpeg(file),
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(String(res.status));
        await save({ background: 'wallpaper', wallpaper: 'own' });
      } catch {
        setError(t('look.uploadFailed'));
      }
    })();
  };
  const removeOwn = async () => {
    setError(null);
    try {
      await data(api.DELETE('/api/me/wallpaper'));
    } catch {
      setError(t('look.error'));
    }
    await queries.invalidateQueries({ queryKey: meKey });
  };
  const commitOpacity = () => {
    if (opacity == null) return;
    void save({ opacity }).then(() => setOpacity(null));
  };

  const fileInput = (
    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} />
  );

  return (
    <Frame studentId={null}>
      <header className="flex items-center gap-2 px-5 pt-1.5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/more')}
          aria-label={t('app.back')}
          className="relative -ml-2 grid size-9 place-items-center text-ink2 after:absolute after:-inset-1"
        >
          <BackIcon size={22} />
        </button>
        <h1 className="text-h1">{t('look.title')}</h1>
      </header>
      {!a ? (
        <p className="px-5 text-ink3">{me.isError ? t('app.error') : t('app.loading')}</p>
      ) : (
        <main className="flex flex-col gap-4 px-5 pb-5">
          {error && (
            <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3 rounded-lg bg-surface px-4 py-3.5 shadow-card">
            <Field label={t('look.theme')}>
              <SegmentedControl
                label={t('look.theme')}
                value={a.theme}
                onChange={(theme) => void save({ theme })}
                options={(['light', 'dark', 'system'] as const).map((v) => ({
                  value: v,
                  label: t(`look.theme.${v}`),
                }))}
              />
            </Field>
            <Field label={t('look.background')}>
              <SegmentedControl
                label={t('look.background')}
                value={a.background}
                onChange={(background) => void save({ background })}
                options={(['color', 'wallpaper'] as const).map((v) => ({
                  value: v,
                  label: t(`look.background.${v}`),
                }))}
              />
            </Field>
            {a.background === 'color' ? (
              <Field label={t('look.palette')}>
                <div className="grid grid-cols-4 gap-2.5">
                  {PALETTES.map((p) => (
                    <Tile
                      key={p}
                      pressed={a.palette === p}
                      onClick={() => void save({ palette: p })}
                      label={t(`look.palette.${p}`)}
                      sample={{
                        swatch: p,
                        className: 'bg-[var(--sw-bg)]',
                        children: <i className="size-[22px] rounded-pill bg-[var(--sw-accent)]" />,
                      }}
                    />
                  ))}
                </div>
                <span className="text-small text-ink3">{t('look.palette.note')}</span>
              </Field>
            ) : (
              <>
                <Field label={t('look.wallpaper')}>
                  <div className="grid grid-cols-3 gap-2.5">
                    {WALLPAPERS.map((w) => (
                      <Tile
                        key={w}
                        wide
                        pressed={a.wallpaper === w}
                        onClick={() => void save({ wallpaper: w })}
                        label={t(`look.wallpaper.${w}`)}
                        sample={{ style: { backgroundImage: `url("/wallpapers/${w}.svg")` } }}
                      />
                    ))}
                    {a.hasOwnWallpaper ? (
                      <Tile
                        wide
                        pressed={a.wallpaper === 'own'}
                        onClick={() => void save({ wallpaper: 'own' })}
                        label={t('look.wallpaper.own')}
                        sample={{
                          className: 'bg-cover bg-center',
                          style: { backgroundImage: 'url("/api/me/wallpaper")' },
                        }}
                      />
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-1.5 text-[12px] font-bold text-ink2">
                        <span className="grid h-[72px] w-full place-items-center rounded-[14px] border-2 border-dashed border-line text-ink3">
                          <PlusIcon />
                        </span>
                        {t('look.wallpaper.upload')}
                        {fileInput}
                      </label>
                    )}
                  </div>
                </Field>
                <Field label={<label htmlFor="wall-op">{t('look.opacity')}</label>}>
                  <div className="flex items-center gap-3">
                    <input
                      id="wall-op"
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={opacity ?? a.opacity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setOpacity(v);
                        document.documentElement.style.setProperty('--wall-op', String(v / 100));
                      }}
                      onPointerUp={commitOpacity}
                      onKeyUp={commitOpacity}
                      className="flex-1 accent-[var(--accent)]"
                    />
                    <b className="w-11 text-right tabular-nums">{opacity ?? a.opacity}%</b>
                  </div>
                  <span className="text-small text-ink3">{t('look.wallpaper.note')}</span>
                </Field>
                {a.hasOwnWallpaper && (
                  <div className="flex gap-2">
                    <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md bg-surface2 text-[14px] font-extrabold">
                      {t('look.wallpaper.replace')}
                      {fileInput}
                    </label>
                    <button
                      type="button"
                      onClick={() => void removeOwn()}
                      className="min-h-11 flex-1 rounded-md bg-surface2 text-[14px] font-extrabold text-band-critical-fg"
                    >
                      {t('look.wallpaper.remove')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col rounded-lg bg-surface px-4 pt-3.5 pb-1 shadow-card">
            <span className="mb-1 text-label text-ink3 uppercase">{t('look.font')}</span>
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={a.font === f}
                onClick={() => void save({ font: f })}
                className="flex w-full items-center gap-3 border-t border-line py-2.5 text-left first-of-type:border-t-0"
              >
                <span className="w-11 text-[22px] font-bold" style={{ fontFamily: fontFamily(f) }}>
                  {t('look.font.sample')}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b style={{ fontFamily: fontFamily(f) }}>{t(`look.font.${f}`)}</b>
                  <span className="text-[12.5px] text-ink3">{t(`look.font.${f}.sub`)}</span>
                </span>
                {a.font === f && <CheckIcon size={20} className="text-accent" />}
              </button>
            ))}
          </div>
          <SubjectColors />
          <Note>{t('look.note')}</Note>
        </main>
      )}
    </Frame>
  );
}

/** Цвета предметов (5.6a): the child this device continues with, their subjects and colours; the family's colours */
function SubjectColors() {
  const t = useT();
  const me = useMe();
  const childId = useContinueChild();
  const child = me.data?.students.find((s) => s.id === childId) ?? null;
  const subjects = useSubjects(child?.id ?? '', { period: 'week', offset: 0 }, { comments: 'all' }, 'alpha');
  const [openId, setOpenId] = useState<string | null>(null);
  if (!child) return null;
  const rows = subjects.data?.subjects.map((r) => r.subject) ?? [];
  const open: SubjectInfo | undefined = rows.find((s) => s.id === openId);
  return (
    <>
      <SectionHeader title={t('look.subjects')} note={t('look.subjects.note', { name: child.name })} />
      {rows.length > 0 && (
        <ListCard>
          {rows.map((s) => (
            <Row
              key={s.id}
              stripe={<Stripe subject={subjectStyle(s.name, s.color)} />}
              title={s.name}
              sub={s.color ? t(`color.${s.color}`) : t('color.auto')}
              onClick={() => setOpenId(s.id)}
            />
          ))}
        </ListCard>
      )}
      {open && (
        <BottomSheet open onClose={() => setOpenId(null)} label={open.name}>
          <div className="subject-accent flex flex-col gap-2" style={subjectStyle(open.name, open.color)}>
            <b className="text-[17px]">{open.name}</b>
            <SubjectColorGrid studentId={child.id} subject={open} />
            <Button onClick={() => setOpenId(null)}>{t('subject.settings.done')}</Button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
