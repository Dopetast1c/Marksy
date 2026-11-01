import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, data } from '../api/client';
import type { SubjectDetail } from '../api/queries';
import { useMe, useStudentCards } from '../api/queries';
import { useT } from '../i18n';
import { AVATAR_SLOT_PX, fitAvatars, TITLE_MIN_PX } from '../lib/fit-bar';
import { useDevice } from '../state/store';
import { StudentAvatar } from './ChildAvatar';
import { BottomSheet, SheetOption } from './BottomSheet';

// The child switcher in every student header (docs/design.md 4, ux-principles D8): avatars only, the family order,
// as many as fit after measuring, the rest behind "+N". Switching keeps the screen, the period and the filters: the
// same path with the other child's id.

export function useSwitchStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const choose = useDevice((s) => s.choose);
  return async (fromId: string, toId: string) => {
    choose(toId);
    // the same place for the other child, without a history step: Back still leads where it led (principle 9)
    const go = (path: string) => navigate(path + location.search, { replace: true });
    const subject = location.pathname.match(/^\/s\/[^/]+\/subjects\/([^/]+)$/);
    if (!subject) return go(location.pathname.replace(`/s/${fromId}`, `/s/${toId}`));
    // a subject is one child's: the other child's subject of the same name, else their list (design.md 4)
    const name = client
      .getQueriesData<SubjectDetail>({ queryKey: ['subject', fromId, subject[1]] })
      .find(([, d]) => d)?.[1]?.subject.name;
    const theirs = name
      ? await client
          .fetchQuery({
            queryKey: ['subject-names', toId],
            queryFn: () =>
              data(
                api.GET('/api/students/{id}/subjects', {
                  params: { path: { id: toId }, query: { period: 'week', offset: 0 } },
                }),
              ),
            staleTime: 5 * 60_000,
          })
          .then((r) => r.subjects.find((s) => s.subject.name === name)?.subject.id)
          .catch(() => undefined)
      : undefined;
    return go(theirs ? `/s/${toId}/subjects/${theirs}` : `/s/${toId}/subjects`);
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
    // the row minus the title's minimum and whatever else sits in it (the back button; the bell from M9)
    const measure = () => {
      const others = [...row.children].filter(
        (el) => !el.hasAttribute('data-header-title') && !el.contains(box.current),
      );
      const taken = others.reduce((w, el) => w + el.getBoundingClientRect().width + 10, 0);
      setAvailable(row.getBoundingClientRect().width - TITLE_MIN_PX - 10 - taken);
    };
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
        // a critical row in this week's Attention (screen.events) of another child: a red badge on that child (design.md 4)
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
            className={`relative grid size-10 place-items-center rounded-pill transition-opacity after:absolute after:-inset-0.5 ${on ? 'opacity-100 outline-[2.5px] outline-offset-1 outline-accent outline-solid' : 'opacity-55 hover:opacity-90'}`}
          >
            <StudentAvatar studentId={k.id} index={i} />
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
          className="relative size-[34px] rounded-pill bg-surface2 text-[12px] font-extrabold text-ink2 after:absolute after:-inset-[5px]"
        >
          +{rest}
        </button>
      )}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t('header.students')}>
        <span className="text-label text-ink3 uppercase">{t('header.students')}</span>
        {kids.map((k, i) => (
          <div key={k.id} className="flex items-center gap-3">
            <StudentAvatar studentId={k.id} index={i} size={40} />
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
