import { useNavigate } from 'react-router';
import { useMe } from '../../api/queries';
import { Avatar, defaultTraits } from '../../components/Avatar';
import { useT } from '../../i18n';
import { useDevice } from '../../state/store';

// «С кого начнём?» (docs/design.md 4). Session A: one button per child; the cards, the switch and the settings row
// follow in session B.

export function PickScreen() {
  const t = useT();
  const me = useMe();
  const choose = useDevice((s) => s.choose);
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-3.5 px-5 py-3">
      <h1 className="text-h1">{t('pick.title')}</h1>
      {me.data?.students.map((k, i) => (
        <button
          key={k.id}
          type="button"
          onClick={() => {
            choose(k.id);
            navigate(`/s/${k.id}`);
          }}
          className="flex items-center gap-3 rounded-lg bg-surface p-4 text-left shadow-card"
        >
          <Avatar traits={defaultTraits(k.grade)} index={i} size={56} />
          <span className="flex flex-col">
            <b>{k.name}</b>
            {k.classLabel && <span className="text-small text-ink3">{k.classLabel}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
