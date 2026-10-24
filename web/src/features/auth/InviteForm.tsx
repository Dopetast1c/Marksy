import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import type { paths } from '../../api/schema';
import { meKey } from '../../api/queries';
import { Button, Field } from '../../components/Field';
import { i18n, rememberForUser, useT } from '../../i18n';
import { errorText } from './errors';

// «У меня есть код приглашения» (docs/design.md 5.1, 7.3): the code (or the /join/<code> link), what it is for (the
// family, the role, the children), then a display name and a Marksy login and password; the person lands on the
// children the admin assigned.

type Invite = paths['/api/invites/{code}']['get']['responses'][200]['content']['application/json'];

export function InviteForm({ initialCode = '' }: { initialCode?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [code, setCode] = useState(initialCode);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [user, setUser] = useState({ displayName: '', login: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.trim().toUpperCase();

  const look = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setInvite(await data(api.GET('/api/invites/{code}', { params: { path: { code: clean } } })));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await data(api.POST('/api/invites/{code}/accept', { params: { path: { code: clean } }, body: user }));
      rememberForUser(i18n.language);
      queries.removeQueries({ queryKey: meKey });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const alert = error && (
    <p role="alert" className="text-small text-band-critical-fg">
      {error}
    </p>
  );

  if (!invite)
    return (
      <form onSubmit={look} className="flex flex-col gap-3.5">
        <Field
          label={t('invite.code')}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          required
          minLength={6}
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {alert}
        <Button type="submit" disabled={busy}>
          {t('invite.check')}
        </Button>
      </form>
    );

  return (
    <form onSubmit={accept} className="flex flex-col gap-3.5">
      <div className="rounded-lg bg-surface p-4 shadow-card">
        <b className="block">{t('invite.family', { family: invite.family })}</b>
        <span className="text-small text-ink2">
          {t(`invite.role.${invite.role}`)}
          {invite.students.length > 0 && ` · ${invite.students.map((s) => s.name).join(', ')}`}
        </span>
      </div>
      <Field
        label={t('connect.displayName')}
        placeholder={t('connect.displayName.hint')}
        required
        maxLength={60}
        value={user.displayName}
        onChange={(e) => setUser({ ...user, displayName: e.target.value })}
      />
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
        required
        minLength={8}
        value={user.password}
        onChange={(e) => setUser({ ...user, password: e.target.value })}
      />
      {alert}
      <Button type="submit" disabled={busy}>
        {t('invite.accept')}
      </Button>
    </form>
  );
}
