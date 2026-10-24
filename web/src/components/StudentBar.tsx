import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useMe, useStudentCards } from '../api/queries';
import { useT } from '../i18n';
import { AVATAR_SLOT_PX, fitAvatars, TITLE_MIN_PX } from '../lib/fit-bar';
import { useDevice } from '../state/store';
import { Avatar, defaultTraits } from './Avatar';
import { BottomSheet, SheetOption } from './BottomSheet';

// The child switcher in every student header (docs/design.md 4, ux-principles D8): avatars only, the family order,
// as many as fit after measuring, the rest behind "+N". Switching keeps the screen, the period and the filters: the
// same path with the other child's id.

export function useSwitchStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const choose = useDevice((s) => s.choose);
  return (fromId: string, toId: string) => {
    choose(toId);
    navigate(location.pathname.replace(`/s/${fromId}`, `/s/${toId}`) + location.search);
  };
}

export function StudentBar({ activeId }: { activeId: string }) {
  const t = useT();
  const me = useMe();
  const cards = useStudentCards();
  const kids = me.data?.students ?? [];
  const switchTo = useSwitchStudent();
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(kids.length * AVATAR_SLOT_PX);
  const [sheet, setSheet] = useState(false);

  useLayoutEffect(() => {
    const row = box.current?.closest('[data-header-row]');
    if (!row || typeof ResizeObserver === 'undefined') return;
    const measure = () => setAvailable(row.getBoundingClientRect().width - TITLE_MIN_PX - 10);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  if (kids.length < 2) return null;
  const active = Math.max(
    0,
    kids.findIndex((k) => k.id === activeId),
  );
  const { visible, rest } = fitAvatars({ count: kids.length, active, available });
  return (
    <div ref={box} role="tablist" aria-label={t('header.students')} className="flex items-center gap-1">
      {visible.map((i) => {
        const k = kids[i]!;
        const on = k.id === activeId;
        // a critical row in this week's Внимание of another child: a red badge on that child (design.md 4)
        const alert = !on && !!cards.data?.find((c) => c.id === k.id)?.alert;
        return (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={alert ? t('header.studentAlert', { name: k.name }) : k.name}
            title={k.classLabel ? `${k.name} · ${k.classLabel}` : k.name}
            onClick={() => !on && switchTo(activeId, k.id)}
            className={`relative grid size-10 place-items-center rounded-pill transition-opacity ${on ? 'opacity-100 outline-[2.5px] outline-offset-1 outline-accent outline-solid' : 'opacity-55 hover:opacity-90'}`}
          >
            <Avatar traits={defaultTraits(k.grade)} index={i} />
            {alert && (
              <i className="absolute -top-0.5 -right-0.5 size-3 rounded-pill border-2 border-bg bg-band-critical-fg" />
            )}
          </button>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t('header.moreStudents', { count: rest })}
          onClick={() => setSheet(true)}
          className="size-[34px] rounded-pill bg-surface2 text-[12px] font-extrabold text-ink2"
        >
          +{rest}
        </button>
      )}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t('header.students')}>
        <span className="text-label text-ink3 uppercase">{t('header.students')}</span>
        {kids.map((k, i) => (
          <div key={k.id} className="flex items-center gap-3">
            <Avatar traits={defaultTraits(k.grade)} index={i} size={40} />
            <SheetOption
              title={k.name}
              {...(k.classLabel ? { sub: k.classLabel } : {})}
              selected={k.id === activeId}
              onSelect={() => {
                setSheet(false);
                if (k.id !== activeId) switchTo(activeId, k.id);
              }}
            />
          </div>
        ))}
      </BottomSheet>
    </div>
  );
}
