import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, data } from '../../api/client';
import type { Schemas } from '../../api/client';
import { useFamily } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { Avatar, defaultTraits } from '../../components/Avatar';
import type { AvatarTraits } from '../../components/Avatar';
import { ChildAvatar } from '../../components/ChildAvatar';
import { Button, Field } from '../../components/Field';
import { BackIcon } from '../../components/icons';
import { Switch } from '../../components/Switch';
import { useT } from '../../i18n';

// A child in Семья (docs/design.md 5.6, D9, D54): the avatar, drawn from traits (every option shown already applied to
// the child's current look) or a photo; for the admin, «Перестать следить», «Следить снова» and «Удалить данные» (7.1).
// A photo is scaled to a 512 px square here, in the browser, and the server checks it again and strips its metadata
// (14.1). The avatar is the child's: every family that follows the child sees the same one.

const OPTIONS = {
  age: ['kid', 'preteen', 'teen', 'adult'],
  look: ['boy', 'girl', 'neutral'],
  skin: ['pale', 'light', 'medium', 'tan', 'brown', 'dark'],
  hair: ['black', 'dark', 'brown', 'lightbrown', 'blond', 'red', 'grey'],
  style: ['buzz', 'short', 'medium', 'long', 'ponytail', 'bob', 'curly', 'braids'],
  eyes: ['brown', 'hazel', 'green', 'blue', 'grey'],
} as const;
type Trait = keyof typeof OPTIONS;
const SWATCH: Partial<Record<Trait, string>> = { skin: 'skin', hair: 'hair', eyes: 'eyes' };

/** A picture as a centred 512 px square JPEG, drawn on a canvas: the photo the server is sent */
async function squareJpeg(file: File, side = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, side, side);
  bitmap.close();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), 'image/jpeg', 0.88));
}

export function ChildScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const { studentId = '' } = useParams();
  const family = useFamily();
  const view = family.data;
  const index = view?.children.findIndex((c) => c.studentId === studentId) ?? 0;
  const child = view?.children[index];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const admin = view?.role === 'admin';
  const avatar: Schemas['Avatar'] = child?.avatar ?? null;
  const traits: AvatarTraits = avatar?.kind === 'traits' ? avatar.traits : defaultTraits();
  const path = { params: { path: { id: studentId } } };

  const done = async (run: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await run();
    } catch {
      setError(t('family.error.failed'));
    } finally {
      setBusy(false);
      await queries.invalidateQueries();
    }
  };
  const setTraits = (next: AvatarTraits) =>
    done(() => data(api.PATCH('/api/students/{id}', { ...path, body: { avatar: next } })));
  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void done(async () => {
      const blob = await squareJpeg(file);
      const res = await fetch(`/api/students/${studentId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(String(res.status));
    });
  };

  if (!child)
    return (
      <Frame studentId={null}>
        <main className="p-5 text-ink3">{family.isError ? t('app.error') : t('app.loading')}</main>
      </Frame>
    );

  return (
    <Frame studentId={null}>
      <header className="flex items-center gap-2 px-5 pt-1.5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/more/family')}
          aria-label={t('app.back')}
          className="relative -ml-2 grid size-9 place-items-center text-ink2 after:absolute after:-inset-1"
        >
          <BackIcon size={22} />
        </button>
        <h1 className="text-h1">{t('family.child.title', { name: child.name })}</h1>
      </header>
      <main className="flex flex-col gap-4 px-5 pb-5">
        <section className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-card">
          <ChildAvatar avatar={avatar} index={index} size={88} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <b className="text-[16px]">{child.name}</b>
            <label className="flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-surface2 px-3 text-[13px] font-extrabold">
              {t('family.child.photo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={upload}
                disabled={busy}
              />
            </label>
            {avatar && (
              <button
                type="button"
                className="text-[13px] font-bold text-ink3"
                onClick={() =>
                  void done(() => data(api.PATCH('/api/students/{id}', { ...path, body: { avatar: null } })))
                }
              >
                {t('family.child.reset')}
              </button>
            )}
          </div>
        </section>
        {error && (
          <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
            {error}
          </p>
        )}
        <section className="flex flex-col gap-3.5 rounded-lg bg-surface p-4 shadow-card">
          {(Object.keys(OPTIONS) as Trait[]).map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-ink2">{t(`avatar.${key}`)}</span>
              <div className="flex flex-wrap gap-2">
                {OPTIONS[key].map((v) => {
                  const on = avatar?.kind === 'traits' && traits[key] === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      aria-label={t(`avatar.${key}.${v}`)}
                      title={t(`avatar.${key}.${v}`)}
                      disabled={busy}
                      onClick={() => void setTraits({ ...traits, [key]: v } as AvatarTraits)}
                      className={`grid size-11 place-items-center rounded-pill ${on ? 'outline-[2.5px] outline-offset-1 outline-accent outline-solid' : ''}`}
                    >
                      {SWATCH[key] ? (
                        <i
                          className="block size-8 rounded-pill"
                          style={{ background: `var(--av-${SWATCH[key]}-${v})` }}
                        />
                      ) : (
                        <Avatar traits={{ ...traits, [key]: v } as AvatarTraits} index={index} size={40} />
                      )}
                    </button>
                  );
                })}
              </div>
              <span className="text-small text-ink3">{t(`avatar.${key}.${traits[key]}`)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <b className="text-[14px]">{t('avatar.glasses')}</b>
            <Switch
              checked={traits.glasses}
              onChange={(on) => void setTraits({ ...traits, glasses: on })}
              label={t('avatar.glasses')}
            />
          </div>
        </section>
        <p className="m-0 text-small text-ink3">{t('family.child.note')}</p>
        {/* simple mode (5.7) belongs to the child's own login: one switch per student member who is this child */}
        {(view?.members ?? [])
          .filter((m) => m.role === 'student' && m.studentIds.includes(studentId))
          .map((m) => (
            <section key={m.userId} className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[14px]">{t('more.simple')}</b>
                <span className="text-small text-ink3">{t('family.child.simpleSub', { name: m.displayName })}</span>
              </span>
              <Switch
                checked={m.uiMode === 'simple'}
                onChange={(on) =>
                  void done(() =>
                    data(
                      api.PUT('/api/family/members/{id}/ui-mode', {
                        params: { path: { id: m.userId } },
                        body: { uiMode: on ? 'simple' : 'full' },
                      }),
                    ),
                  )
                }
                label={t('more.simple')}
              />
            </section>
          ))}
        {admin && (
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-card">
            {child.status === 'stopped' ? (
              <>
                <Button
                  type="button"
                  onClick={() => void done(() => data(api.POST('/api/family/students/{id}/follow', path)))}
                >
                  {t('family.child.followAgain')}
                </Button>
                {!child.sharedWithOtherFamily && (
                  <>
                    <span className="pt-2 text-small text-ink3">
                      {t('family.child.deleteNote', { name: child.name })}
                    </span>
                    <Field
                      label={t('family.child.confirm')}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                    <Button
                      type="button"
                      ghost
                      disabled={confirm.trim() !== child.name}
                      onClick={() =>
                        void done(async () => {
                          await data(api.DELETE('/api/family/students/{id}/data', { ...path, body: { confirm } }));
                          navigate('/more/family', { replace: true });
                        })
                      }
                    >
                      <span className="text-band-critical-fg">{t('family.child.delete')}</span>
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  ghost
                  onClick={() => void done(() => data(api.DELETE('/api/family/students/{id}', path)))}
                >
                  {t('family.child.stop')}
                </Button>
                <span className="text-small text-ink3">{t('family.child.stopNote')}</span>
              </>
            )}
          </section>
        )}
      </main>
    </Frame>
  );
}
