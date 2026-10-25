import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import type { Locale } from '../../api/client';
import { meKey, useFamily, useMe, useSyncStatus } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { useContinueChild } from '../../app/guards';
import { Avatar, defaultTraits } from '../../components/Avatar';
import { ChildAvatar } from '../../components/ChildAvatar';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import { BulbIcon, OutIcon, PaletteIcon, SchoolIcon, SyncIcon, UsersIcon } from '../../components/icons';
import { LanguagePicker } from '../../components/LanguagePicker';
import { MenuCard, MenuRow } from '../../components/MenuRow';
import { Switch } from '../../components/Switch';
import { lookSummary } from '../look/LookScreen';
import { familyLine, schoolLine, syncLine } from './summaries';
import { setLanguage, useT } from '../../i18n';
import { useDevice } from '../../state/store';

// Ещё (docs/design.md 5.6) opens without a picked child. Order, from the most important down: who is signed in; what
// the app does for the family (Семья, Школа, Синхронизация; Настройки уведомлений with M9, Теги with M6); how the app
// looks and behaves (Оформление, Простой режим, Подсказки, Всегда начинать с последнего, Язык, Сменить семью); last
// and apart, Выйти. While nobody is picked it starts with «Ученик не выбран», which leads back to the choice (design 4).

export function MoreScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const me = useMe();
  const alwaysLast = useDevice((s) => s.alwaysLast);
  const setAlwaysLast = useDevice((s) => s.setAlwaysLast);
  const [families, setFamilies] = useState(false);
  // the child this device continues with under the 12-hour rule: an old pick does not open from a tab (D7)
  const continueWith = useContinueChild();
  const user = me.data?.user;
  const family = me.data?.family ?? null;
  const kids = me.data?.students ?? [];
  const parent = family?.role !== 'student';
  const child = kids.find((k) => k.id === continueWith) ?? null;
  // the live lines of Семья and Синхронизация are the adults' (a student has neither row)
  const view = useFamily(parent).data;
  const sync = useSyncStatus();
  const signOut = async () => {
    await api.POST('/api/auth/logout');
    queries.clear();
    navigate('/login', { replace: true });
  };
  // Школа is the selected child's (5.9): shown when the provider has bells or terms, for the child or, before a pick,
  // for any child; without a pick it asks for the child first
  const hasSchool = (k: (typeof kids)[number]) => !!k.capabilities.bellSchedule || k.capabilities.terms !== 'none';
  const school = child ? hasSchool(child) : kids.some(hasSchool);
  const guidance = async (on: boolean) => {
    await data(api.PATCH('/api/me/settings', { body: { guidance: on } }));
    // advice comes and goes on every child's screen
    await queries.invalidateQueries();
  };
  // simple mode (5.7) is the student's own; a parent switches it on the child's screen in Семья
  const simple = async (on: boolean) => {
    await data(api.PATCH('/api/me', { body: { uiMode: on ? 'simple' : 'full' } }));
    await queries.invalidateQueries();
  };
  const switchFamily = async (familyId: string) => {
    setFamilies(false);
    await data(api.POST('/api/auth/family', { body: { familyId } }));
    // another family: other children, tags, rules; start from the choice again
    queries.clear();
    useDevice.getState().forget();
    navigate('/', { replace: true });
  };

  return (
    <Frame studentId={continueWith}>
      <header className="px-5 pt-1.5 pb-3">
        <h1 className="text-h1">{t('screen.more')}</h1>
      </header>
      <main className="flex flex-col gap-3.5 px-5 pb-5">
        {!continueWith && kids.length > 1 && (
          <MenuCard>
            <MenuRow
              icon={<UsersIcon />}
              title={t('more.unpicked')}
              sub={t('more.unpicked.text')}
              onClick={() => navigate('/pick')}
            />
          </MenuCard>
        )}
        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 shadow-card">
            {/* a student is the child: their own avatar, as on the pick card and in the student bar */}
            {!parent && kids[0] ? (
              <ChildAvatar avatar={kids[0].avatar} index={0} size={44} />
            ) : (
              <Avatar traits={{ ...defaultTraits(), age: 'adult' }} index={kids.length} size={44} />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px]">
                {t('more.who', { name: user.displayName, role: t(`role.${family?.role ?? 'parent'}`) })}
              </b>
              <span className="text-[12.5px] text-ink3">
                {parent || !kids[0]
                  ? t('more.who.family', { family: family?.name ?? '', count: kids.length })
                  : [kids[0].classLabel, kids[0].schoolLabel].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
        )}
        <MenuCard>
          {parent && (
            <MenuRow
              icon={<UsersIcon />}
              title={t('family.title')}
              sub={view ? familyLine(t, view) : undefined}
              onClick={() => navigate('/more/family')}
            />
          )}
          {school && (
            <MenuRow
              icon={<SchoolIcon />}
              title={t('more.school')}
              sub={schoolLine(
                t,
                (child ?? kids.find(hasSchool) ?? kids[0])?.capabilities.terms ?? 'none',
                child?.name ?? null,
              )}
              onClick={() => navigate(child ? `/s/${child.id}/school` : '/pick')}
            />
          )}
          {parent && (
            <MenuRow
              icon={<SyncIcon />}
              title={t('sync.title')}
              sub={
                syncLine(
                  t,
                  parent ? sync.data : undefined,
                  (a) => kids.find((k) => a.studentIds.includes(k.id))?.timezone ?? kids[0]?.timezone ?? 'UTC',
                ) ?? undefined
              }
              onClick={() => navigate('/more/sync')}
            />
          )}
        </MenuCard>
        <MenuCard>
          {user && (
            <MenuRow
              icon={<PaletteIcon />}
              title={t('look.title')}
              sub={lookSummary(t, user.appearance)}
              onClick={() => navigate('/more/look')}
            />
          )}
          {!parent && (
            <MenuRow
              icon={<SchoolIcon />}
              title={t('more.simple')}
              sub={t('more.simple.sub')}
              control={
                <Switch
                  checked={user?.uiMode === 'simple'}
                  onChange={(on) => void simple(on)}
                  label={t('more.simple')}
                />
              }
            />
          )}
          <MenuRow
            icon={<BulbIcon />}
            title={t('more.guidance')}
            sub={t('more.guidance.sub')}
            control={
              <Switch
                checked={user?.guidance ?? true}
                onChange={(on) => void guidance(on)}
                label={t('more.guidance')}
              />
            }
          />
          {parent && (
            <MenuRow
              icon={<UsersIcon />}
              title={t('pick.alwaysLast')}
              sub={alwaysLast ? t('more.alwaysLast.on') : t('more.alwaysLast.off')}
              control={<Switch checked={alwaysLast} onChange={setAlwaysLast} label={t('pick.alwaysLast')} />}
            />
          )}
          <LanguagePicker
            variant="row"
            onPick={async (lng) => {
              await setLanguage(lng);
              await api.PATCH('/api/me', { body: { locale: lng as Locale } });
              await queries.invalidateQueries({ queryKey: meKey });
            }}
          />
          {(me.data?.memberships.length ?? 0) > 1 && (
            <MenuRow
              icon={<UsersIcon />}
              title={t('more.switchFamily')}
              sub={family?.name}
              onClick={() => setFamilies(true)}
            />
          )}
        </MenuCard>
        <MenuCard>
          <MenuRow
            icon={<OutIcon />}
            tone="quiet"
            title={t('more.signOut')}
            sub={t('more.signOut.sub')}
            onClick={() => void signOut()}
            chevron={false}
          />
        </MenuCard>
        <p className="m-0 text-center text-small text-ink3">{t('more.readOnly', { version: __MARKSY_VERSION__ })}</p>
      </main>
      <BottomSheet open={families} onClose={() => setFamilies(false)} label={t('more.switchFamily')}>
        <span className="text-label text-ink3 uppercase">{t('more.switchFamily')}</span>
        {me.data?.memberships.map((m) => (
          <SheetOption
            key={m.familyId}
            title={m.familyName}
            sub={t(`role.${m.role}`)}
            selected={m.familyId === family?.id}
            onSelect={() => void switchFamily(m.familyId)}
          />
        ))}
      </BottomSheet>
    </Frame>
  );
}
