import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, data } from '../../api/client';
import { meKey } from '../../api/queries';
import { Button, Field } from '../../components/Field';
import { LanguagePicker } from '../../components/LanguagePicker';
import { SegmentedControl } from '../../components/SegmentedControl';
import { rememberForUser, setLanguage, useT } from '../../i18n';
import { ConnectForm } from './ConnectForm';
import { errorText } from './errors';
import { InviteForm } from './InviteForm';

// Вход (docs/design.md 5.1): the wordmark and one line across the full width; Вход (a Marksy login, the default) and
// Подключить дневник; «У меня есть код приглашения» under the sign-in; the language at the very bottom, remembered
// on the device and given to the user after sign-in. /join/<code> opens the invite with its code filled in.

/** The wordmark: a name, not a word to translate */
const BRAND = 'Marksy';

type Mode = 'login' | 'connect' | 'invite';

export function LoginScreen() {
  const t = useT();
  const { code } = useParams();
  const [mode, setMode] = useState<Mode>(code ? 'invite' : 'login');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-4 px-6 pt-6 pb-5">
      <div className="flex flex-1 flex-col justify-center gap-[22px]">
        <div>
          <div className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em]">
            {BRAND.slice(0, -1)}
            <span className="text-accent">{BRAND.slice(-1)}</span>
          </div>
          <p className="mt-2 text-ink2">{t('login.tagline')}</p>
        </div>
        {mode === 'invite' ? (
          <>
            <InviteForm initialCode={code ?? ''} />
            <Button ghost onClick={() => setMode('login')}>
              {t('invite.back')}
            </Button>
          </>
        ) : (
          <>
            <SegmentedControl
              label={t('login.mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'login', label: t('login.mode.login') },
                { value: 'connect', label: t('login.mode.connect') },
              ]}
            />
            {mode === 'login' ? (
              <>
                <SignIn />
                <Button ghost onClick={() => setMode('invite')}>
                  {t('invite.have')}
                </Button>
                <p className="text-small text-ink3">{t('login.note')}</p>
              </>
            ) : (
              <ConnectForm />
            )}
          </>
        )}
      </div>
      <div className="flex justify-center">
        <LanguagePicker
          onPick={(lng) => {
            void setLanguage(lng);
            rememberForUser(lng);
          }}
        />
      </div>
    </div>
  );
}

function SignIn() {
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
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field
        label={t('login.marksyLogin')}
        autoComplete="username"
        required
        value={login}
        onChange={(e) => setLogin(e.target.value)}
      />
      <Field
        label={t('login.password')}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-small text-band-critical-fg">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {t('login.submit')}
      </Button>
    </form>
  );
}
