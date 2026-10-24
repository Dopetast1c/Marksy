import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { Frame } from '../../app/Frame';
import { OutIcon } from '../../components/icons';
import { useT } from '../../i18n';
import { useDevice } from '../../state/store';

// Ещё (docs/design.md 5.6) opens without a picked child. Session A: sign out; «Ученик не выбран», the language and
// the rest follow in session B and M5d.

export function MoreScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const pick = useDevice((s) => s.pick);
  const signOut = async () => {
    await api.POST('/api/auth/logout');
    queries.clear();
    navigate('/login', { replace: true });
  };
  return (
    <Frame studentId={pick?.id ?? null}>
      <header className="px-5 pt-1.5 pb-3">
        <h1 className="text-h1">{t('screen.more')}</h1>
      </header>
      <main className="flex flex-col gap-3.5 px-5 pb-5">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card"
        >
          <span className="grid size-8 place-items-center rounded-[9px] bg-accent-soft text-accent">
            <OutIcon />
          </span>
          <b className="text-[14px]">{t('more.signOut')}</b>
        </button>
      </main>
    </Frame>
  );
}
