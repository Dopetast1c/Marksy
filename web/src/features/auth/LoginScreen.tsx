import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiFailure, data } from '../../api/client';
import { meKey } from '../../api/queries';
import { useT } from '../../i18n';

// Вход (docs/design.md 5.1). Session A: the Marksy login; «Подключить дневник», the invite code and the language
// picker follow in session B.

/** The wordmark: a name, not a word to translate */
const BRAND = 'Marksy';

export function LoginScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await data(api.POST('/api/auth/login', { body: { login, password } }));
      // the cached answer is "nobody": drop it, so the next screen asks again
      queries.removeQueries({ queryKey: meKey });
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiFailure && err.status === 429
          ? t('login.tooMany')
          : err instanceof ApiFailure && err.status === 401
            ? t('login.wrong')
            : t('app.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-6 py-10">
      <div>
        <div className="font-display text-[34px] font-semibold">
          {BRAND.slice(0, -1)}
          <span className="text-accent">{BRAND.slice(-1)}</span>
        </div>
        <p className="mt-2 text-ink2">{t('login.tagline')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink3 uppercase">{t('login.marksyLogin')}</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
            className="min-h-[var(--tap-min)] rounded-md border border-line bg-surface px-3.5"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink3 uppercase">{t('login.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="min-h-[var(--tap-min)] rounded-md border border-line bg-surface px-3.5"
          />
        </label>
        {error && (
          <p role="alert" className="text-small text-band-critical-fg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-[var(--tap-min)] rounded-pill bg-accent font-bold text-accent-ink disabled:opacity-60"
        >
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
