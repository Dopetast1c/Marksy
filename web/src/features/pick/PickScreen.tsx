import { shortDate } from '@marksy/core';
import { useNavigate } from 'react-router';
import { useMe, useStudentCards } from '../../api/queries';
import { EmptyState } from '../../components/EmptyState';
import { ChevIcon, SlidersIcon } from '../../components/icons';
import { StudentPickerCard } from '../../components/StudentPickerCard';
import { Switch } from '../../components/Switch';
import { dateStyle, useT } from '../../i18n';
import { todayIn } from '../../lib/time';
import { useDevice } from '../../state/store';

// "Who first?" (pick.title; docs/design.md 4, ux-principles D7, D10): one card per child, the whole card is the
// button; under the cards the switch "Always start with the last one" (pick.alwaysLast) and the entry "Settings"
// (pick.settings), which opens More (tabs.more) without a child. No
// bell here until M9 brings the inbox. A person in several families sees the current family's children; the grouping
// by family and "Switch family" (more.switchFamily) come with M5d.

export function PickScreen() {
  const t = useT();
  const me = useMe();
  const cards = useStudentCards();
  const navigate = useNavigate();
  const choose = useDevice((s) => s.choose);
  const alwaysLast = useDevice((s) => s.alwaysLast);
  const setAlwaysLast = useDevice((s) => s.setAlwaysLast);
  const kids = me.data?.students ?? [];
  // the date of the first child's school (two schools in one family are in one country in practice)
  const tz = kids[0]?.timezone ?? 'UTC';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <header className="flex flex-col gap-px px-5 pt-1.5 pb-3">
        <h1 className="text-h1">{t('pick.title')}</h1>
        <span className="text-[12px] font-semibold text-ink3">
          {shortDate(todayIn(tz), dateStyle(), { weekday: true })}
        </span>
      </header>
      <main className="flex flex-col gap-3.5 px-5 pb-6">
        {!cards.data && <EmptyState title={cards.isError ? t('app.error') : t('app.loading')} />}
        {(cards.data ?? []).map((card) => {
          const index = kids.findIndex((k) => k.id === card.id);
          return (
            <StudentPickerCard
              key={card.id}
              card={card}
              summary={kids[index]}
              index={Math.max(0, index)}
              onPick={() => {
                choose(card.id);
                navigate(`/s/${card.id}`);
              }}
            />
          );
        })}
        <div className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3.5 shadow-card">
          <span className="flex flex-1 flex-col gap-0.5">
            <b>{t('pick.alwaysLast')}</b>
            <span className="text-small text-ink3">{t('pick.alwaysLast.text')}</span>
          </span>
          <Switch checked={alwaysLast} onChange={setAlwaysLast} label={t('pick.alwaysLast')} />
        </div>
        <button
          type="button"
          onClick={() => navigate('/more')}
          className="flex w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card"
        >
          <span className="grid size-8 flex-none place-items-center rounded-[9px] bg-accent-soft text-accent">
            <SlidersIcon />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-[14px]">{t('pick.settings')}</b>
            <span className="text-[12.5px] text-ink3">{t('pick.settings.text')}</span>
          </span>
          <ChevIcon className="text-ink3" />
        </button>
      </main>
    </div>
  );
}
