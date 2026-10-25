import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});

describe('Семья', () => {
  it('the admin sees the request to join with its diary, the members, the children, the diaries, the family’s switches', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family" />);
    expect(await screen.findByText('Заявки на вступление')).toBeTruthy();
    expect(screen.getByText('Школьный портал (демо) · логин papa-login')).toBeTruthy();
    expect(screen.getByText('администратор · все дети')).toBeTruthy();
    expect(screen.getByText('родитель · Марк')).toBeTruthy();
    expect(screen.getByText('Также следит другая семья')).toBeTruthy();
    expect(screen.getByText('demo-login')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Принять' }));
    expect(api.bodies['PATCH /api/family/join-requests/jr-1']).toEqual({ approve: true });
    const guidance = screen.getByRole('switch', { name: 'Подсказки для всей семьи' });
    await user.click(guidance);
    expect(api.bodies['PATCH /api/family']).toEqual({ guidance: false });
  });

  it('an invite: the role and the children, then a code and a link', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more/family" />);
    await user.click(await screen.findByRole('button', { name: 'Пригласить · код действует 48 часов' }));
    const sheet = screen.getByRole('dialog');
    const create = within(sheet).getByRole('button', { name: 'Создать код' });
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
    await user.click(screen.getByRole('button', { name: 'косы' }));
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
    expect(await screen.findByRole('button', { name: 'Без аватара' })).toBeTruthy();
    // the admin may stop following; the child stays in the history
    expect(screen.getByRole('button', { name: 'Перестать следить' })).toBeTruthy();
  });
});
