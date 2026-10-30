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
});
