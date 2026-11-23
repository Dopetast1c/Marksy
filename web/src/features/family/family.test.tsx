import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});

describe('Family', () => {
  it('the admin sees the request to join with its diary, the members, the children, the diaries, the family’s switches', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family" />);
    expect(await screen.findByText('Requests to join')).toBeTruthy();
    expect(screen.getByText('Школьный портал (демо) · login papa-login')).toBeTruthy();
    expect(screen.getByText('admin · all children')).toBeTruthy();
    expect(screen.getByText('parent · Марк')).toBeTruthy();
    expect(screen.getByText('Another family follows too')).toBeTruthy();
    expect(screen.getByText('demo-login')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(api.bodies['PATCH /api/family/join-requests/jr-1']).toEqual({ approve: true });
    const guidance = screen.getByRole('switch', { name: 'Tips for the whole family' });
    await user.click(guidance);
    expect(api.bodies['PATCH /api/family']).toEqual({ guidance: false });
  });

  it('an invite: the role and the children, then a code and a link', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family" />);
    await user.click(await screen.findByRole('button', { name: 'Invite · the code works for 48 hours' }));
    const sheet = screen.getByRole('dialog');
    const create = within(sheet).getByRole('button', { name: 'Create the code' });
    expect(create.hasAttribute('disabled')).toBe(true);
    await user.click(within(sheet).getByText('Марк'));
    await user.click(create);
    expect(api.bodies['POST /api/family/invites']).toEqual({ role: 'parent', studentIds: ['kid-mark'] });
    expect(await within(sheet).findByText('K7M2Q9')).toBeTruthy();
  });

  it('a child’s avatar: each option shown on the child, one tap saves it', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family/child/kid-mark" />);
    expect(await screen.findByRole('heading', { name: 'Марк' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'braids' }));
    expect(api.bodies['PATCH /api/students/kid-mark']).toEqual({
      avatar: {
        age: 'preteen',
        look: 'neutral',
        skin: 'light',
        hair: 'dark',
        style: 'braids',
        eyes: 'brown',
        glasses: false,
      },
    });
    expect(await screen.findByRole('button', { name: 'No avatar' })).toBeTruthy();
    // the admin may stop following; the child stays in the history
    expect(screen.getByRole('button', { name: 'Stop following' })).toBeTruthy();
  });

  it('reading the diary: a preset, custom settings, back to the year’s default; the estimate follows (D63)', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family/child/kid-milena" />);
    const row = await screen.findByRole('button', { name: /Reading the diary/ });
    expect(row.textContent).toContain('With marks · the year’s default');
    expect(screen.getByText(/About 26 requests on a school day/).textContent).toContain('within about an hour');

    await user.click(row);
    let sheet = screen.getByRole('dialog', { name: 'How often to read the diary' });
    expect(within(sheet).getByRole('button', { name: /^Light/ }).textContent).toContain('≈ 4 a day');
    await user.click(within(sheet).getByRole('button', { name: /^Light/ }));
    expect(api.bodies['PUT /api/family/students/kid-milena/sync']).toEqual({ mode: 'light' });
    expect((await screen.findByText(/About 4 requests on a school day/)).textContent).toContain('after the lessons');

    await user.click(screen.getByRole('button', { name: /Reading the diary/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Custom/ }));
    expect(api.bodies['PUT /api/family/students/kid-milena/sync']).toMatchObject({
      mode: 'custom',
      custom: { day: 'afterSchool', termRecheck: 'biweekly' },
    });
    await user.click(await screen.findByRole('button', { name: /During the school day/ }));
    sheet = screen.getByRole('dialog', { name: 'During the school day' });
    await user.click(within(sheet).getByRole('button', { name: 'Every two hours' }));
    expect(api.bodies['PUT /api/family/students/kid-milena/sync']).toMatchObject({
      mode: 'custom',
      custom: { day: 'every2h', termRecheck: 'biweekly' },
    });
    expect(await screen.findByText(/within about 2 hours/)).toBeTruthy();

    // the year's own preset stores nothing: the child follows a change of year by itself
    await user.click(screen.getByRole('button', { name: /Reading the diary/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^With marks/ }));
    expect(api.bodies['PUT /api/family/students/kid-milena/sync']).toEqual({ mode: null });
  });

  it('a child another family reads more often says so, without that family', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/more/family/child/kid-mark" />);
    const row = await screen.findByRole('button', { name: /Reading the diary/ });
    expect(row.textContent).toContain('Without marks · the year’s default');
    expect(screen.getByText(/Another family follows Марк too/)).toBeTruthy();
    // three runs a day of the other family's choice: 3 logins, 3 current weeks, 0.6 next weeks
    expect(screen.getByText(/About 7 requests on a school day/).textContent).toContain('within about 2 hours');
  });
});
