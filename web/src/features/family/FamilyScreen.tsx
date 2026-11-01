import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiFailure, data } from '../../api/client';
import type { FamilyView } from '../../api/queries';
import { useFamily, useMe } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { ChildAvatar } from '../../components/ChildAvatar';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import { Button, Field } from '../../components/Field';
import { BackIcon, BulbIcon, SyncIcon, UsersIcon } from '../../components/icons';
import { MenuCard, MenuRow } from '../../components/MenuRow';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Switch } from '../../components/Switch';
import { intlLocale, useT } from '../../i18n';
import { appPath } from '../../lib/base';
import { ConnectForm } from '../auth/ConnectForm';

// Family (family.title; docs/design.md 5.6, 7.1–7.3, ux-principles D54), for the admin and parents: the requests to
// join (admin), the members with their role and which children they see, an invite, the children (avatar, "Another
// family follows too" family.child.shared, nothing more about that family), the diaries (system, login, status,
// children), "Add a diary" (family.addDiary), and the family's own switches (admin): "Tips for the whole family"
// (family.guidance), whether parents may invite. Passwords of diaries are never
// shown; the members sign in to Marksy with their own logins.

type Member = FamilyView['members'][number];
type Account = FamilyView['accounts'][number];
type Role = Member['role'];

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <header className="flex items-center gap-2 px-5 pt-1.5 pb-3">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('app.back')}
        className="relative -ml-2 grid size-9 place-items-center text-ink2 after:absolute after:-inset-1"
      >
        <BackIcon size={22} />
      </button>
      <h1 className="text-h1">{title}</h1>
    </header>
  );
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{title}</h2>
        {note && <span className="text-small text-ink3">{note}</span>}
      </div>
      {children}
    </section>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase();

export function FamilyScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const me = useMe();
  const family = useFamily();
  const [member, setMember] = useState<Member | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = family.data;
  const admin = view?.role === 'admin';
  const names = (ids: readonly string[]) =>
    ids
      .map((id) => view?.children.find((c) => c.studentId === id)?.name)
      .filter(Boolean)
      .join(', ');
  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof ApiFailure && e.status === 403 ? t('family.error.forbidden') : t('family.error.failed'));
    }
    await queries.invalidateQueries();
  };
  const setFamily = (body: { guidance?: boolean; parentsCanInvite?: boolean }) =>
    act(() => data(api.PATCH('/api/family', { body })));

  return (
    <Frame studentId={null}>
      <Header title={t('family.title')} onBack={() => navigate('/more')} />
      <main className="flex flex-col gap-4 px-5 pb-5">
        {!view && <p className="text-ink3">{family.isError ? t('app.error') : t('app.loading')}</p>}
        {error && (
          <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
            {error}
          </p>
        )}
        {view && admin && view.joinRequests.length > 0 && (
          <Section title={t('family.requests')}>
            <MenuCard>
              {view.joinRequests.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
                  <span className="flex flex-col">
                    <b className="text-[14px]">{r.displayName}</b>
                    <span className="text-[12.5px] text-ink3">
                      {r.diary
                        ? t('family.requests.diary', { system: r.diary.providerName, login: r.diary.label })
                        : ''}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        void act(() =>
                          data(
                            api.PATCH('/api/family/join-requests/{id}', {
                              params: { path: { id: r.id } },
                              body: { approve: true },
                            }),
                          ),
                        )
                      }
                    >
                      {t('family.requests.accept')}
                    </Button>
                    <Button
                      type="button"
                      ghost
                      onClick={() =>
                        void act(() =>
                          data(
                            api.PATCH('/api/family/join-requests/{id}', {
                              params: { path: { id: r.id } },
                              body: { approve: false },
                            }),
                          ),
                        )
                      }
                    >
                      {t('family.requests.decline')}
                    </Button>
                  </span>
                </div>
              ))}
            </MenuCard>
          </Section>
        )}
        {view && view.matches.length > 0 && (
          <MenuCard>
            <MenuRow
              icon={<UsersIcon />}
              title={t('family.matches', { count: view.matches.length })}
              sub={view.matches.map((m) => m.name).join(', ')}
              onClick={() => navigate('/connect/matches')}
            />
          </MenuCard>
        )}
        {view && (
          <Section title={t('family.members')} note={String(view.members.length)}>
            <MenuCard>
              {view.members.map((m) => (
                <MenuRow
                  key={m.userId}
                  icon={<span className="text-[13px] font-extrabold">{initials(m.displayName)}</span>}
                  title={m.displayName}
                  sub={[
                    t(`role.${m.role}`),
                    m.role === 'admin' ? t('family.allChildren') : names(m.studentIds) || t('family.noChildren'),
                  ].join(' · ')}
                  {...(admin && m.userId !== me.data?.user.id ? { onClick: () => setMember(m) } : {})}
                />
              ))}
            </MenuCard>
            {(admin || view.family.parentsCanInvite) && (
              <Button type="button" ghost onClick={() => setInviting(true)}>
                {t('family.invite')}
              </Button>
            )}
          </Section>
        )}
        {view && (
          <Section title={t('family.children')}>
            <MenuCard>
              {view.children.map((c, i) => (
                <MenuRow
                  key={c.studentId}
                  icon={<ChildAvatar avatar={c.avatar} index={i} size={36} />}
                  tone="avatar"
                  title={c.name}
                  sub={
                    <>
                      {[c.classLabel, c.schoolLabel, c.status === 'stopped' ? t('family.child.stopped') : null]
                        .filter(Boolean)
                        .join(' · ')}
                      {c.sharedWithOtherFamily && <span className="block text-accent">{t('family.child.shared')}</span>}
                    </>
                  }
                  onClick={() => navigate(`/more/family/child/${c.studentId}`)}
                />
              ))}
            </MenuCard>
          </Section>
        )}
        {view && (
          <Section title={t('family.diaries')}>
            <MenuCard>
              {view.accounts.map((a) => (
                <MenuRow
                  key={a.id}
                  icon={<SyncIcon />}
                  title={a.label}
                  sub={[
                    a.providerName,
                    // the school of the children it reads (5.6): one, or the first of several
                    view.children.find((c) => a.studentIds.includes(c.studentId) && c.schoolLabel)?.schoolLabel,
                    names(a.studentIds),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  // the state at the right, a dot and a word, so a refused login stands out (colour never alone)
                  aside={
                    <span
                      className={`flex flex-none items-center gap-1.5 text-[12.5px] font-bold ${a.status === 'ok' ? 'text-band-good-fg' : 'text-band-critical-fg'}`}
                    >
                      <i className="size-2 rounded-pill bg-current" />
                      {t(`family.status.${a.status}`)}
                    </span>
                  }
                  {...(admin ? { onClick: () => setAccount(a) } : {})}
                />
              ))}
            </MenuCard>
            <Button type="button" ghost onClick={() => setAdding(true)}>
              {t('family.addDiary')}
            </Button>
            <p className="m-0 text-small text-ink3">{t('family.diaries.note')}</p>
          </Section>
        )}
        {view && admin && (
          <Section title={t('family.settings')}>
            <MenuCard>
              <MenuRow
                icon={<BulbIcon />}
                title={t('family.guidance')}
                sub={t('family.guidance.sub')}
                control={
                  <Switch
                    checked={view.family.guidance}
                    onChange={(on) => void setFamily({ guidance: on })}
                    label={t('family.guidance')}
                  />
                }
              />
              <MenuRow
                icon={<UsersIcon />}
                title={t('family.parentsInvite')}
                sub={t('family.parentsInvite.sub')}
                control={
                  <Switch
                    checked={view.family.parentsCanInvite}
                    onChange={(on) => void setFamily({ parentsCanInvite: on })}
                    label={t('family.parentsInvite')}
                  />
                }
              />
            </MenuCard>
          </Section>
        )}
      </main>
      {view && member && <MemberSheet view={view} member={member} onClose={() => setMember(null)} act={act} />}
      {view && <InviteSheet view={view} open={inviting} onClose={() => setInviting(false)} />}
      {view && account && <AccountSheet account={account} onClose={() => setAccount(null)} act={act} />}
      <BottomSheet open={adding} onClose={() => setAdding(false)} label={t('family.addDiary')}>
        <span className="text-label text-ink3 uppercase">{t('family.addDiary')}</span>
        {adding && <ConnectForm intoFamily={{ onDone: () => setAdding(false) }} />}
      </BottomSheet>
    </Frame>
  );
}

/** The admin changes a member's role and which children they see, or removes them (design.md 7.3) */
function MemberSheet({
  view,
  member,
  onClose,
  act,
}: {
  view: FamilyView;
  member: Member;
  onClose: () => void;
  act: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const t = useT();
  const [role, setRole] = useState<Role>(member.role);
  const [kids, setKids] = useState<string[]>(member.studentIds);
  const toggle = (id: string) =>
    setKids(role === 'student' ? [id] : kids.includes(id) ? kids.filter((k) => k !== id) : [...kids, id]);
  // a student sees exactly one child: themselves (7.6)
  const valid = role !== 'student' || kids.length === 1;
  const path = { params: { path: { id: member.userId } } };
  return (
    <BottomSheet open onClose={onClose} label={member.displayName}>
      <span className="text-label text-ink3 uppercase">{member.displayName}</span>
      <SegmentedControl
        label={t('family.member.role')}
        value={role}
        onChange={(r) => {
          setRole(r);
          if (r === 'student') setKids(kids.slice(0, 1));
        }}
        options={(['admin', 'parent', 'student'] as const).map((r) => ({ value: r, label: t(`role.${r}`) }))}
      />
      {role !== 'admin' && (
        <>
          <span className="pt-1 text-small text-ink3">
            {role === 'student' ? t('family.member.whoIsStudent') : t('family.member.sees')}
          </span>
          {view.children.map((c) => (
            <SheetOption
              key={c.studentId}
              title={c.name}
              selected={kids.includes(c.studentId)}
              onSelect={() => toggle(c.studentId)}
            />
          ))}
        </>
      )}
      <Button
        type="button"
        disabled={!valid}
        onClick={() =>
          void act(() =>
            data(api.PATCH('/api/family/members/{id}', { ...path, body: { role, studentIds: kids } })),
          ).then(onClose)
        }
      >
        {t('family.member.save')}
      </Button>
      <Button
        type="button"
        ghost
        onClick={() => void act(() => data(api.DELETE('/api/family/members/{id}', path))).then(onClose)}
      >
        <span className="text-band-critical-fg">{t('family.member.remove')}</span>
      </Button>
    </BottomSheet>
  );
}

/** An invite: a role, the children, then a code valid for 48 hours and a link (design.md 7.3) */
function InviteSheet({ view, open, onClose }: { view: FamilyView; open: boolean; onClose: () => void }) {
  const t = useT();
  const [role, setRole] = useState<'parent' | 'student'>('parent');
  const [kids, setKids] = useState<string[]>([]);
  const [made, setMade] = useState<{ code: string; url: string; expiresAt: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const close = () => {
    setMade(null);
    setKids([]);
    setFailed(false);
    onClose();
  };
  const valid = role === 'student' ? kids.length === 1 : kids.length > 0;
  const create = async () => {
    setFailed(false);
    try {
      const res = await data(api.POST('/api/family/invites', { body: { role, studentIds: kids } }));
      // the invite's path is the app's own (/join/<code>): the link carries the base path the app is served under
      setMade({
        code: res.code,
        url: new URL(appPath(res.url), window.location.origin).href,
        expiresAt: String(res.expiresAt),
      });
    } catch {
      setFailed(true);
    }
  };
  const until = made
    ? new Intl.DateTimeFormat(intlLocale(), {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(made.expiresAt))
    : '';
  return (
    <BottomSheet open={open} onClose={close} label={t('family.invite')}>
      <span className="text-label text-ink3 uppercase">{t('family.invite')}</span>
      {made ? (
        <>
          <b className="text-center text-[28px] tracking-[.12em] tabular-nums">{made.code}</b>
          <span className="text-center text-small text-ink3">{t('family.invite.until', { until })}</span>
          <Field label={t('family.invite.link')} readOnly value={made.url} onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" onClick={() => void navigator.clipboard?.writeText(made.url)}>
            {t('family.invite.copy')}
          </Button>
        </>
      ) : (
        <>
          <SegmentedControl
            label={t('family.member.role')}
            value={role}
            onChange={(r) => {
              setRole(r);
              setKids([]);
            }}
            options={[
              { value: 'parent', label: t('role.parent') },
              { value: 'student', label: t('role.student') },
            ]}
          />
          <span className="pt-1 text-small text-ink3">
            {role === 'student' ? t('family.member.whoIsStudent') : t('family.member.sees')}
          </span>
          {view.children
            .filter((c) => c.status === 'active')
            .map((c) => (
              <SheetOption
                key={c.studentId}
                title={c.name}
                selected={kids.includes(c.studentId)}
                onSelect={() =>
                  setKids(
                    role === 'student'
                      ? [c.studentId]
                      : kids.includes(c.studentId)
                        ? kids.filter((k) => k !== c.studentId)
                        : [...kids, c.studentId],
                  )
                }
              />
            ))}
          {failed && (
            <span role="alert" className="text-small text-band-critical-fg">
              {t('family.error.failed')}
            </span>
          )}
          <Button type="button" disabled={!valid} onClick={() => void create()}>
            {t('family.invite.create')}
          </Button>
        </>
      )}
    </BottomSheet>
  );
}

/** A diary of the family: its status and, for the admin, a new password after the diary refused the old one */
function AccountSheet({
  account,
  onClose,
  act,
}: {
  account: Account;
  onClose: () => void;
  act: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  return (
    <BottomSheet open onClose={onClose} label={account.label}>
      <span className="text-label text-ink3 uppercase">
        {account.providerName} · {account.label}
      </span>
      <span className="text-small text-ink3">{t(`family.status.${account.status}.long`)}</span>
      <Field
        label={t('family.account.password')}
        type="password"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button
        type="button"
        disabled={!password}
        onClick={() =>
          void act(() =>
            data(
              api.PUT('/api/family/accounts/{id}/password', {
                params: { path: { id: account.id } },
                body: { password },
              }),
            ),
          ).then(onClose)
        }
      >
        {t('family.account.save')}
      </Button>
      <span className="text-small text-ink3">{t('family.account.note')}</span>
    </BottomSheet>
  );
}
