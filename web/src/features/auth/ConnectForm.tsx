import { CONSENT_VERSION } from '@marksy/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import type { Schemas } from '../../api/client';
import { meKey } from '../../api/queries';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import { Button, Field } from '../../components/Field';
import { DownIcon } from '../../components/icons';
import { SegmentedControl } from '../../components/SegmentedControl';
import { i18n, intlLocale, rememberForUser, useT } from '../../i18n';
import { errorText } from './errors';

// «Подключить дневник» (docs/design.md 5.1, 7.2): the diary system, the fields its manifest asks for, the role when
// the system knows both, and the Marksy login the person wants. The system is named in one place only, the «Страна и
// дневник» row; every other label says «дневник», so the screen works for any provider without new copy.

type Provider = Schemas['Provider'];

/** Where a stranger reads how to add their own diary system */
const PROVIDERS_DOC = 'https://github.com/Dopetast1c/Marksy/blob/main/docs/providers.md';

export function providerLabel(p: Provider, locale: string): string {
  if (!p.country) return p.name;
  const country = new Intl.DisplayNames([locale], { type: 'region' }).of(p.country) ?? p.country;
  return `${country} · ${p.name}`;
}

export function ConnectForm() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => data(api.GET('/api/providers')) });
  const [chosen, setChosen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [role, setRole] = useState<'parent' | 'student'>('parent');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [user, setUser] = useState({ login: '', password: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = intlLocale();
  const list = providers.data ?? [];
  const provider = list.find((p) => p.id === chosen) ?? list[0];

  const fieldLabel = (f: Provider['auth']['fields'][number]) =>
    f.key === 'login'
      ? t('connect.diaryLogin')
      : f.key === 'password'
        ? t('connect.diaryPassword')
        : (f.label[i18n.language] ?? f.label.en ?? f.key);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      const res = await data(
        api.POST('/api/auth/connect', {
          body: { providerId: provider.id, credentials: creds, role, user, consentVersion: CONSENT_VERSION },
        }),
      );
      // the family was made in this language: it becomes the new user's
      rememberForUser(i18n.language);
      queries.removeQueries({ queryKey: meKey });
      navigate(res.connect.matches.length ? '/connect/matches' : '/', { replace: true });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-ink2">{t('connect.provider')}</span>
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          className="flex min-h-12 items-center gap-2 rounded-md border-[1.5px] border-line bg-surface px-3.5 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-bold">
            {provider ? providerLabel(provider, locale) : t('app.loading')}
          </span>
          <DownIcon size={16} className="flex-none text-ink3" />
        </button>
        {provider?.status === 'beta' && <span className="text-small text-band-low-fg">{t('connect.beta')}</span>}
      </div>
      {provider && provider.roles.length > 1 && (
        <SegmentedControl
          label={t('connect.role')}
          value={role}
          onChange={setRole}
          options={[
            { value: 'parent', label: t('connect.role.parent') },
            { value: 'student', label: t('connect.role.student') },
          ]}
        />
      )}
      {provider?.auth.fields.map((f) => (
        <Field
          key={f.key}
          label={fieldLabel(f)}
          type={f.type === 'password' ? 'password' : 'text'}
          autoComplete="off"
          required
          value={creds[f.key] ?? ''}
          onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
        />
      ))}
      <Field
        label={t('connect.marksyLogin')}
        autoComplete="username"
        required
        minLength={3}
        value={user.login}
        onChange={(e) => setUser({ ...user, login: e.target.value })}
      />
      <Field
        label={t('connect.marksyPassword')}
        type="password"
        autoComplete="new-password"
        placeholder={t('connect.marksyPassword.hint')}
        required
        minLength={8}
        value={user.password}
        onChange={(e) => setUser({ ...user, password: e.target.value })}
      />
      <Field
        label={t('connect.displayName')}
        placeholder={t('connect.displayName.hint')}
        required
        maxLength={60}
        value={user.displayName}
        onChange={(e) => setUser({ ...user, displayName: e.target.value })}
      />
      {error && (
        <p role="alert" className="text-small text-band-critical-fg">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !provider}>
        {busy ? t('connect.checking') : t('connect.submit')}
      </Button>
      <p className="text-small text-ink3">{t('connect.consent')}</p>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t('connect.provider')}>
        <span className="text-label text-ink3 uppercase">{t('connect.provider')}</span>
        {list.map((p) => (
          <SheetOption
            key={p.id}
            title={providerLabel(p, locale)}
            {...(p.status === 'beta' ? { sub: t('connect.beta.short') } : {})}
            selected={p.id === provider?.id}
            onSelect={() => {
              setChosen(p.id);
              setCreds({});
              setSheet(false);
            }}
          />
        ))}
        <a href={PROVIDERS_DOC} target="_blank" rel="noreferrer" className="flex flex-col py-2.5">
          <b>{t('connect.otherCountry')}</b>
          <span className="text-small text-ink3">{t('connect.otherCountry.sub')}</span>
        </a>
      </BottomSheet>
    </form>
  );
}
