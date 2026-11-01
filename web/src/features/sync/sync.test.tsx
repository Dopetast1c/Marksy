import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});

// the fixtures' clock: Wednesday 21 October 2026, 19:12 at the school (test/setup.ts)
const account = {
  id: 'acc-1',
  providerId: 'demo-full',
  providerName: 'Школьный портал (демо)',
  label: 'demo-login',
  status: 'ok',
  lastSuccessAt: '2026-10-21T10:17:00Z',
  lastAttemptAt: '2026-10-21T10:17:00Z',
  lastRun: {
    kind: 'scheduled',
    status: 'success',
    errorClass: null,
    startedAt: '2026-10-21T10:17:00Z',
    finishedAt: '2026-10-21T10:18:00Z',
  },
  consecutiveFailures: 0,
  pausedUntil: null,
  nextAllowedAt: null,
  studentIds: ['kid-milena', 'kid-mark'],
  plan: {
    window: { from: '07:30', to: '16:20' },
    windowStudentIds: ['kid-milena', 'kid-mark'],
    next: { kind: 'nextSchoolDay', at: null },
    sets: { standing: 6, rescan: 2 },
    maxRequestsPerRun: 40,
    rescan: { lastFullAt: '2026-10-19T09:00:00Z', oldestVerifiedAt: '2026-10-16T09:00:00Z' },
    drift: [
      {
        id: 'd1',
        endpoint: 'diary',
        kind: 'unknown_field',
        path: 'days[].lessons[].extra',
        firstSeenAt: '2026-10-21T06:05:00Z',
        lastSeenAt: '2026-10-21T06:05:00Z',
        count: 2,
      },
    ],
  },
};

describe('Sync', () => {
  it('the state card, what the next run takes, the re-scan, the drift and the log', async () => {
    fakeApi({
      signedIn: true,
      syncStatus: { accounts: [account], students: [] },
      syncRuns: [
        {
          id: 'r1',
          accountId: 'acc-1',
          kind: 'scheduled',
          trigger: 'schedule',
          status: 'success',
          errorClass: null,
          requests: 9,
          startedAt: '2026-10-21T10:17:00Z',
          finishedAt: '2026-10-21T10:18:00Z',
          stats: {},
        },
      ],
    });
    render(<App at="/more/sync" />);
    expect(await screen.findByText('demo-login · Школьный портал (демо)')).toBeTruthy();
    expect(screen.getByText('all fresh')).toBeTruthy();
    expect(screen.getByText('today 07:30–16:20 · school day: Милена, Марк')).toBeTruthy();
    expect(screen.getByText('on the next school day')).toBeTruthy();
    expect(screen.getByText('this, the next and the last week')).toBeTruthy();
    expect(screen.getByText('6 weeks')).toBeTruthy();
    expect(screen.getByText('about 8 requests: one per week and child, one after another, with pauses')).toBeTruthy();
    expect(screen.getByText('days[].lessons[].extra')).toBeTruthy();
    expect(screen.getByText('scheduled · done · 9 requests')).toBeTruthy();
  });

  it('"Refresh now" (sync.refresh) within the login budget says when the next login is possible; a refused password leads to Family', async () => {
    const api = fakeApi({ signedIn: true, syncStatus: { accounts: [account], students: [] } });
    const user = userEvent.setup();
    const { unmount } = render(<App at="/more/sync" />);
    await user.click(await screen.findByRole('button', { name: 'Refresh now' }));
    expect(api.bodies['POST /api/sync/run']).toEqual({ accountId: 'acc-1' });
    expect(await screen.findByText('the next diary login is possible at 20:12')).toBeTruthy();
    // "Check the history again" (sync.rescan.button): whom and the period, the children's term word
    await user.click(screen.getByRole('button', { name: 'Check the history again' }));
    const sheet = screen.getByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'School year' }));
    await user.click(within(sheet).getByRole('button', { name: 'Queue it' }));
    expect(api.bodies['POST /api/sync/rescan']).toEqual({ accountId: 'acc-1', period: 'year' });
    expect(await screen.findByText('7 weeks are queued to be read again')).toBeTruthy();
    unmount();

    fakeApi({ signedIn: true, syncStatus: { accounts: [{ ...account, status: 'auth_failed' }], students: [] } });
    render(<App at="/more/sync" />);
    expect(await screen.findByRole('button', { name: 'Update the diary password' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh now' })).toBeNull();
  });
});
