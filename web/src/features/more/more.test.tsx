import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { FIXTURE_NOW } from '../../test/setup';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});

const [milena] = KIDS as [(typeof KIDS)[number]];

describe('More', () => {
  it('in the documented order: the choice, who is signed in, School, the switches, the language, Sign out last', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/more" />);
    expect(await screen.findByText('Родитель (admin)')).toBeTruthy();
    const titles = [...document.querySelectorAll('main b')].map((b) => b.textContent);
    const order = [
      'No student chosen',
      'Родитель (admin)',
      'School',
      'Tips',
      'Always start with the last one',
      'Language',
      'Sign out',
    ];
    expect(titles.filter((x) => order.includes(x ?? ''))).toEqual(order);
    expect(screen.getByText('Семья · 2 students')).toBeTruthy();
    // no child picked: School asks for one first
    await userEvent.setup().click(screen.getByText('School'));
    expect(await screen.findByText('Who first?')).toBeTruthy();
  });

  it('"Tips" (more.guidance) is the person’s own switch, saved at once', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more" />);
    const guidance = await screen.findByRole('switch', { name: 'Tips' });
    expect(guidance.getAttribute('aria-checked')).toBe('true');
    await user.click(guidance);
    expect(api.bodies['PATCH /api/me/settings']).toEqual({ guidance: false });
    expect((await screen.findByRole('switch', { name: 'Tips' })).getAttribute('aria-checked')).toBe('false');
  });

  it('with a child picked, School opens that child’s school', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: FIXTURE_NOW.getTime() }, alwaysLast: false });
    fakeApi({ signedIn: true });
    render(<App at="/more" />);
    // the periods' word comes from the provider's term kind
    await userEvent.setup().click(await screen.findByText('Милена: bells, quarters and holidays'));
    expect(await screen.findByRole('button', { name: 'Bells' })).toBeTruthy();
  });

  it('live lines: the family, the diaries’ state or its problem, the language’s review, the version', async () => {
    const at = (iso: string) => iso;
    fakeApi({
      signedIn: true,
      syncStatus: {
        accounts: [
          {
            id: 'acc-1',
            status: 'ok',
            studentIds: ['kid-milena'],
            lastSuccessAt: at('2026-10-21T09:17:00Z'),
            plan: { next: { kind: 'at', at: at('2026-10-21T17:00:00Z') } },
          },
        ],
        students: [],
      },
    });
    const { unmount } = render(<App at="/more" />);
    expect(await screen.findByText('3 members · Милена, Марк · 1 diary')).toBeTruthy();
    expect(await screen.findByText(/^Today at 12:17 · next at about 20:00$/)).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText(/^Marksy \d+\.\d+\.\d+ · the diary is only read/)).toBeTruthy();
    unmount();
    // a problem says itself instead of the times
    fakeApi({
      signedIn: true,
      syncStatus: { accounts: [{ id: 'acc-1', status: 'auth_failed', studentIds: ['kid-milena'] }], students: [] },
    });
    const { unmount: done } = render(<App at="/more" />);
    // a problem in the warning colour
    expect((await screen.findByText('A new password is needed')).className).toContain('text-band-critical-fg');
    done();
  });

  it('the next run on another day: its date and time; across holidays "after the holidays"; a run in progress is neutral', async () => {
    const account = (next: object, status = 'ok') => ({
      signedIn: true,
      syncStatus: {
        accounts: [
          {
            id: 'acc-1',
            status,
            studentIds: ['kid-milena'],
            lastSuccessAt: '2026-10-21T09:17:00Z',
            plan: { next: { at: null, date: null, afterHolidays: false, ...next } },
          },
        ],
        students: [],
      },
    });
    const shown = async (state: ReturnType<typeof account>, text: RegExp) => {
      fakeApi(state);
      const view = render(<App at="/more" />);
      const found = await screen.findByText(text);
      view.unmount();
      return found;
    };
    await shown(
      account({ kind: 'nextSchoolDay', date: '2026-10-26', at: '2026-10-26T05:13:00Z' }),
      /^Today at 12:17 · next Mon, 26 Oct at 08:13$/,
    );
    await shown(
      account({ kind: 'nextSchoolDay', date: '2026-11-09', afterHolidays: true }),
      /^Today at 12:17 · next after the holidays, Mon, 9 Nov$/,
    );
    await shown(account({ kind: 'nextSchoolDay' }), /^Today at 12:17 · next on a school day$/);
    const reading = await shown(account({ kind: 'now' }, 'loading'), /^Reading the diary$/);
    expect(reading.className).not.toContain('band');
  });
});

describe('School', () => {
  it('Bells: every lesson with its time and length, the breaks between them', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/school`} />);
    expect(await screen.findByText('08:30 – 09:15')).toBeTruthy();
    expect(screen.getAllByText('45 min').length).toBe(4);
    expect(screen.getAllByText('break 10 min')).toHaveLength(2);
    expect(screen.getByText('break 20 min')).toBeTruthy();
    expect(screen.getByText('Mon–Fri · 08:30–12:10 · 4 lessons')).toBeTruthy();
    expect(screen.getByText(/The bells of class 7 «Г»/)).toBeTruthy();
  });

  it('Quarters: the term going on, the holidays named from their kind, from Attention straight to it', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/school?tab=year`} />);
    // today is 21 October: the first term runs, the autumn holidays are next
    const now = await screen.findByText('Now');
    const card = now.closest('section')!;
    expect(within(card).getByText('Quarter I')).toBeTruthy();
    expect(within(card).getByText(/11 days left · 11 days until the holidays/)).toBeTruthy();
    expect(screen.getByText('Autumn holidays')).toBeTruthy();
    expect(screen.getByText('8 days')).toBeTruthy();
    // "now" (school.running): the term going on
    expect(screen.getByText('now')).toBeTruthy();
  });
});
