import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { Locale } from '../../api/client';
import { meKey, useMe } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { ChevIcon, OutIcon, UsersIcon } from '../../components/icons';
import { LanguagePicker } from '../../components/LanguagePicker';
import { setLanguage, useT } from '../../i18n';
import { useContinueChild } from '../../app/guards';

// Ещё (docs/design.md 5.6) opens without a picked child. While nobody is picked it starts with «Ученик не выбран»,
// which leads back to the choice (design 4). The language is saved to the user at once. Семья, Синхронизация, Теги,
// Оформление and the rest come with M5d.

export function MoreScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const me = useMe();
  // the child this device continues with under the 12-hour rule: an old pick does not open from a tab (D7)
  const continueWith = useContinueChild();
  const kids = me.data?.students ?? [];
  const picked = !!continueWith;
  const signOut = async () => {
    await api.POST('/api/auth/logout');
    queries.clear();
    navigate('/login', { replace: true });
  };
  const row = 'flex w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card';
  const icon = 'grid size-8 flex-none place-items-center rounded-[9px] bg-accent-soft text-accent';
  return (
    <Frame studentId={continueWith}>
      <header className="px-5 pt-1.5 pb-3">
        <h1 className="text-h1">{t('screen.more')}</h1>
      </header>
      <main className="flex flex-col gap-3.5 px-5 pb-5">
        {!picked && kids.length > 1 && (
          <button type="button" onClick={() => navigate('/pick')} className={row}>
            <span className={icon}>
              <UsersIcon />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[14px]">{t('more.unpicked')}</b>
              <span className="text-[12.5px] text-ink3">{t('more.unpicked.text')}</span>
            </span>
            <ChevIcon className="text-ink3" />
          </button>
        )}
        <LanguagePicker
          variant="row"
          onPick={async (lng) => {
            await setLanguage(lng);
            await api.PATCH('/api/me', { body: { locale: lng as Locale } });
            await queries.invalidateQueries({ queryKey: meKey });
          }}
        />
        <button type="button" onClick={signOut} className={row}>
          <span className={icon}>
            <OutIcon />
          </span>
          <b className="text-[14px]">{t('more.signOut')}</b>
        </button>
      </main>
    </Frame>
  );
}
