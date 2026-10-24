import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import { meKey } from '../../api/queries';
import { Button } from '../../components/Field';
import { useT } from '../../i18n';

// «Дневник подключён» (docs/design.md 7.2, ux-principles D54): the connected login shows a child another family
// already follows. Never a second copy of the child: the parent chooses, once per child, to follow from their own
// family (no approval, the diary gives this login access; the other family gets one notice without names) or to ask
// to join that family (its admin decides).

type Choice = 'follow' | 'join';

export function ConnectMatchScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const family = useQuery({ queryKey: ['family'], queryFn: () => data(api.GET('/api/family')) });
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const matches = family.data?.matches ?? [];

  const go = async () => {
    setBusy(true);
    setError(false);
    try {
      for (const m of matches)
        await data(
          api.POST('/api/family/accounts/{id}/matches/{studentId}', {
            params: { path: { id: m.accountId, studentId: m.studentId } },
            body: { action: choices[m.studentId] ?? 'follow' },
          }),
        );
      await queries.invalidateQueries({ queryKey: meKey });
      navigate('/', { replace: true });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const option = (studentId: string, value: Choice) => {
    const on = (choices[studentId] ?? 'follow') === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setChoices({ ...choices, [studentId]: value })}
        className={`flex w-full gap-3 rounded-lg bg-surface p-4 text-left shadow-card ${on ? 'outline-2 outline-accent outline-solid' : ''}`}
      >
        <span
          className={`mt-0.5 size-5 flex-none rounded-pill border-2 ${on ? 'border-[6px] border-accent' : 'border-line'}`}
        />
        <span className="flex flex-col gap-1">
          <b>{t(`match.${value}`)}</b>
          <span className="text-small text-ink2">{t(`match.${value}.text`)}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-3.5 px-5 py-3">
      <h1 className="text-h1">{t('match.title')}</h1>
      {matches.map((m) => (
        <section key={m.studentId} className="flex flex-col gap-2.5">
          <div className="rounded-lg bg-surface p-4 shadow-card">
            <b className="block">{t('match.known', { name: m.name })}</b>
            <span className="text-small text-ink3">{t('match.followed')}</span>
          </div>
          <span id={`how-${m.studentId}`} className="text-label text-ink3 uppercase">
            {t('match.how')}
          </span>
          <div role="radiogroup" aria-labelledby={`how-${m.studentId}`} className="flex flex-col gap-2.5">
            {option(m.studentId, 'follow')}
            {option(m.studentId, 'join')}
          </div>
        </section>
      ))}
      {error && (
        <p role="alert" className="text-small text-band-critical-fg">
          {t('app.error')}
        </p>
      )}
      <Button onClick={go} disabled={busy || family.isPending}>
        {t('match.continue')}
      </Button>
      <p className="text-small text-ink3">{t('match.note')}</p>
    </div>
  );
}
