import { shortDate } from '@marksy/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, data } from '../../api/client';
import type { SyncStatus } from '../../api/queries';
import { useMe, useSyncRuns, useSyncStatus } from '../../api/queries';
import { Frame } from '../../app/Frame';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import { Button } from '../../components/Field';
import { BackIcon } from '../../components/icons';
import { SegmentedControl } from '../../components/SegmentedControl';
import { dateStyle, intlLocale, useT } from '../../i18n';
import { formatTime } from '../../lib/time';
import { whenText } from '../../lib/when';

// Sync (sync.title; docs/design.md 5.6, 10.4, D22, D55): one block per diary account of the family, each with its state
// card (status, the last data, the last attempt and its outcome, failures in a row, the next run and why, today's
// window and whose school day makes it, a plain note when something is wrong), what the next run will take, the term's
// re-scan, changes in the diary's API, "Refresh now" (sync.refresh) and "Check the history again"
// (sync.rescan.button) (both within the one-login-per-interval budget; after a refused password the main button leads
// to Family, family.title), and the run log. Times are the school's.

type Account = SyncStatus['accounts'][number];

const TONE: Record<Account['status'], string> = {
  ok: 'text-band-good-fg',
  loading: 'text-accent',
  stale: 'text-band-low-fg',
  paused: 'text-band-low-fg',
  auth_failed: 'text-band-critical-fg',
  blocked: 'text-band-critical-fg',
  needs_2fa: 'text-band-critical-fg',
};

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px]">
      <span className="text-ink3">{label}</span>
      <b className="text-right">{children}</b>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-lg bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SyncScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const me = useMe();
  const status = useSyncStatus();
  const runs = useSyncRuns();
  const [message, setMessage] = useState<string | null>(null);
  const [rescanFor, setRescanFor] = useState<Account | null>(null);
  const kids = me.data?.students ?? [];
  const tz = kids[0]?.timezone ?? 'UTC';
  const locale = intlLocale();
  const nameOf = (id: string) => kids.find((k) => k.id === id)?.name ?? '';
  const names = (ids: readonly string[]) => ids.map(nameOf).filter(Boolean).join(', ');
  // a diary's times in its own children's time zone (a family's diaries may be in different countries)
  const tzOf = (a: Account) => kids.find((k) => a.studentIds.includes(k.id))?.timezone ?? tz;
  const at = (d: string | Date | null, zone = tz) => (d ? whenText(t, d, zone) : t('sync.never'));
  const reload = () =>
    queries.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'sync-status' || q.queryKey[0] === 'sync-runs' });

  const refresh = async (a: Account) => {
    setMessage(null);
    let res;
    try {
      res = await data(api.POST('/api/sync/run', { body: { accountId: a.id } }));
    } catch {
      setMessage(t('sync.failed'));
      return;
    }
    setMessage(
      res.started
        ? t('sync.refresh.started')
        : res.reason === 'interval' && res.retryAt
          ? t('sync.refresh.later', { at: formatTime(res.retryAt, tzOf(a), locale) })
          : res.reason === 'demo'
            ? t('sync.refresh.demo')
            : res.reason === 'off'
              ? t('sync.refresh.off')
              : t('sync.refresh.action'),
    );
    await reload();
  };
  const ack = async (id: string) => {
    try {
      await data(api.POST('/api/sync/drift/{id}/ack', { params: { path: { id } } }));
    } catch {
      setMessage(t('sync.failed'));
    }
    await reload();
  };

  const nextText = (a: Account) => {
    const n = a.plan?.next;
    if (!n) return '—';
    switch (n.kind) {
      case 'now':
        return t('sync.next.now');
      case 'soon':
        return t('sync.next.soon');
      case 'at':
        return n.at ? t('sync.next.at', { when: at(n.at, tzOf(a)) }) : '—';
      case 'paused':
        return n.at ? t('sync.next.paused', { when: at(n.at, tzOf(a)) }) : t('sync.next.pausedPlain');
      case 'action':
        return t('sync.next.action');
      case 'offline':
        return t('sync.next.offline');
      default: {
        // the next school day: its date (and time) when the planner knows it, the general words only when not
        if (!n.date) return t('sync.next.nextSchoolDay');
        const day = shortDate(n.date, dateStyle(), { weekday: true });
        if (n.afterHolidays) return t('sync.next.afterHolidays', { when: day });
        return n.at ? t('sync.next.at', { when: at(n.at, tzOf(a)) }) : day;
      }
    }
  };

  const block = (a: Account) => {
    const p = a.plan;
    const zone = tzOf(a);
    const refused = a.status === 'auth_failed' || a.status === 'blocked' || a.status === 'needs_2fa';
    const allowedAt = a.nextAllowedAt && new Date(a.nextAllowedAt) > new Date() ? a.nextAllowedAt : null;
    const weeks = Object.entries(p?.sets ?? {}).filter(([, n]) => n > 0);
    const total = weeks.reduce((s, [, n]) => s + n, 0);
    return (
      <div key={a.id} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <b className="text-[15px]">
            {a.label} · {a.providerName}
          </b>
          <span className="text-small text-ink3">{names(a.studentIds)}</span>
        </div>
        <Card
          title={t('sync.state')}
          aside={<b className={`text-[13px] ${TONE[a.status]}`}>{t(`sync.status.${a.status}`)}</b>}
        >
          <Kv label={t('sync.lastData')}>{at(a.lastSuccessAt, zone)}</Kv>
          <Kv label={t('sync.lastAttempt')}>
            {a.lastRun
              ? `${at(a.lastRun.startedAt, zone)} · ${t(`sync.outcome.${a.lastRun.status}`, { defaultValue: a.lastRun.status })}`
              : t('sync.never')}
          </Kv>
          {a.consecutiveFailures > 0 && <Kv label={t('sync.failures')}>{a.consecutiveFailures}</Kv>}
          <Kv label={t('sync.next')}>{nextText(a)}</Kv>
          <Kv label={t('sync.window')}>
            {p?.window
              ? t('sync.window.today', { from: p.window.from, to: p.window.to, who: names(p.windowStudentIds) })
              : t('sync.window.none')}
          </Kv>
          {a.status !== 'ok' && a.status !== 'loading' && (
            <span className="pt-1 text-small text-ink3">{t(`sync.note.${a.status}`)}</span>
          )}
        </Card>
        {total > 0 && (
          <Card title={t('sync.plan')}>
            {weeks.map(([set, n]) => (
              <Kv key={set} label={t(`sync.set.${set}`)}>
                {t('sync.weeks', { count: n })}
              </Kv>
            ))}
            <span className="pt-1 text-small text-ink3">
              {t('sync.plan.note', { count: Math.min(total, p?.maxRequestsPerRun ?? total) })}
            </span>
          </Card>
        )}
        {p && (
          <Card title={t('sync.rescan')} aside={<span className="text-small text-ink3">{t('sync.rescan.when')}</span>}>
            <Kv label={t('sync.rescan.lastFull')}>{p.rescan.lastFullAt ? at(p.rescan.lastFullAt, zone) : '—'}</Kv>
            <Kv label={t('sync.rescan.oldest')}>
              {p.rescan.oldestVerifiedAt ? at(p.rescan.oldestVerifiedAt, zone) : '—'}
            </Kv>
            <span className="pt-1 text-small text-ink3">{t('sync.rescan.note')}</span>
          </Card>
        )}
        {p && p.drift.length > 0 && (
          <Card
            title={t('sync.drift')}
            aside={<b className="text-[13px] text-band-low-fg">{t('sync.drift.count', { count: p.drift.length })}</b>}
          >
            {p.drift.map((d) => (
              <div key={d.id} className="flex flex-col gap-0.5 border-t border-line py-2 first:border-t-0">
                <b className="text-[13.5px]">
                  {t(`sync.drift.kind.${d.kind}`, { defaultValue: d.kind })}:{' '}
                  <code className="text-[12.5px]">{d.path}</code>
                </b>
                <span className="text-small text-ink3">
                  {t('sync.drift.seen', { endpoint: d.endpoint, when: at(d.firstSeenAt, zone), count: d.count })}
                </span>
                <button
                  type="button"
                  onClick={() => void ack(d.id)}
                  className="self-start py-1 text-[13px] font-bold text-accent"
                >
                  {t('sync.drift.ack')}
                </button>
              </div>
            ))}
          </Card>
        )}
        {refused ? (
          <Button type="button" onClick={() => navigate('/more/family')}>
            {t('sync.newPassword')}
          </Button>
        ) : (
          <Button type="button" ghost={!!allowedAt} onClick={() => void refresh(a)}>
            {allowedAt ? t('sync.refresh.allowedAt', { at: formatTime(allowedAt, zone, locale) }) : t('sync.refresh')}
          </Button>
        )}
        {!refused && (
          <Button type="button" ghost onClick={() => setRescanFor(a)}>
            {t('sync.rescan.button')}
          </Button>
        )}
      </div>
    );
  };

  const others = status.data?.students.filter((s) => s.readThrough === 'otherFamily') ?? [];
  return (
    <Frame studentId={null}>
      <header className="flex items-center gap-2 px-5 pt-1.5 pb-3">
        <button
          type="button"
          onClick={() => navigate('/more')}
          aria-label={t('app.back')}
          className="relative -ml-2 grid size-9 place-items-center text-ink2 after:absolute after:-inset-1"
        >
          <BackIcon size={22} />
        </button>
        <h1 className="text-h1">{t('sync.title')}</h1>
      </header>
      <main className="flex flex-col gap-4 px-5 pb-5">
        {!status.data && <p className="text-ink3">{status.isError ? t('app.error') : t('app.loading')}</p>}
        {message && (
          <p role="status" className="m-0 text-small font-semibold text-accent">
            {message}
          </p>
        )}
        {status.data && status.data.accounts.length === 0 && others.length === 0 && (
          <p className="m-0 text-ink3">{t('sync.noAccounts')}</p>
        )}
        {status.data?.accounts.map(block)}
        {others.map((s) => (
          <Card key={s.id} title={nameOf(s.id)}>
            <span className="text-small text-ink3">{t('sync.otherFamily', { when: at(s.lastSuccessAt) })}</span>
          </Card>
        ))}
        {(runs.data?.length ?? 0) > 0 && (
          <Card title={t('sync.log')} aside={<span className="text-small text-ink3">{t('sync.log.kept')}</span>}>
            {runs.data!.map((r) => (
              <div
                key={r.id}
                className="flex items-baseline gap-2 border-t border-line py-1.5 text-[13px] first:border-t-0"
              >
                <i
                  className={`size-2 flex-none rounded-pill ${r.status === 'success' ? 'bg-band-good-fg' : r.status === 'failed' ? 'bg-band-critical-fg' : 'bg-ink3/55'}`}
                />
                <b className="whitespace-nowrap">{at(r.startedAt)}</b>
                <span className="text-ink3">
                  {[
                    t(`sync.kind.${r.kind}`, { defaultValue: r.kind }),
                    t(`sync.outcome.${r.status}`, { defaultValue: r.status }),
                    r.requests ? t('sync.requests', { count: r.requests }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </Card>
        )}
        <p className="m-0 text-center text-small text-ink3">{t('sync.footer')}</p>
      </main>
      {rescanFor && (
        <RescanSheet
          account={rescanFor}
          names={nameOf}
          termKind={kids.find((k) => rescanFor.studentIds.includes(k.id))?.capabilities.terms ?? 'none'}
          onClose={() => setRescanFor(null)}
          onDone={(text) => {
            setRescanFor(null);
            setMessage(text);
            void reload();
          }}
        />
      )}
    </Frame>
  );
}

/** "Check the history again" (sync.rescan.button): whom and which period; the weeks are read again by the next runs (10.4) */
function RescanSheet({
  account,
  names,
  termKind,
  onClose,
  onDone,
}: {
  account: Account;
  names: (id: string) => string;
  /** the children's term kind: the word for «the current term» comes from it, never typed */
  termKind: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const [who, setWho] = useState<string | null>(null);
  const [period, setPeriod] = useState<'term' | 'year'>('term');
  const go = async () => {
    try {
      const res = await data(
        api.POST('/api/sync/rescan', {
          body: { accountId: account.id, period, ...(who ? { studentIds: [who] } : {}) },
        }),
      );
      onDone(res.reason === 'demo' ? t('sync.refresh.demo') : t('sync.rescan.queued', { count: res.weeks }));
    } catch {
      onDone(t('sync.failed'));
    }
  };
  return (
    <BottomSheet open onClose={onClose} label={t('sync.rescan.button')}>
      <span className="text-label text-ink3 uppercase">{t('sync.rescan.button')}</span>
      <span className="text-small text-ink3">{t('sync.rescan.who')}</span>
      <SheetOption title={t('sync.rescan.everyone')} selected={who === null} onSelect={() => setWho(null)} />
      {account.studentIds.map((id) => (
        <SheetOption key={id} title={names(id)} selected={who === id} onSelect={() => setWho(id)} />
      ))}
      <span className="pt-1 text-small text-ink3">{t('sync.rescan.period')}</span>
      <SegmentedControl
        label={t('sync.rescan.period')}
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'term', label: termKind !== 'none' ? t(`term.${termKind}`) : t('sync.rescan.term') },
          { value: 'year', label: t('sync.rescan.year') },
        ]}
      />
      <span className="text-small text-ink3">{t('sync.rescan.cost')}</span>
      <Button type="button" onClick={() => void go()}>
        {t('sync.rescan.go')}
      </Button>
    </BottomSheet>
  );
}
