import { CONSENT_VERSION } from '@marksy/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { i18n, initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});
afterEach(async () => {
  await i18n.changeLanguage('ru');
});

describe('the login screen', () => {
  it('connects a diary: the fields the system asks for, «дневник» labels, the consent version; then the shared child', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Подключить дневник' }));
    // the system is named in one place; the fields say «дневник»
    expect(await screen.findByText('Школьный портал (демо)')).toBeTruthy();
    expect(screen.getByText(/тестовом режиме/)).toBeTruthy();
    await user.type(screen.getByLabelText('Логин в дневнике'), 'diary-user');
    await user.type(screen.getByLabelText('Пароль от дневника'), 'x');
    await user.type(screen.getByLabelText('Ваш логин в Marksy'), 'parent@example.com');
    await user.type(screen.getByLabelText('Ваш пароль в Marksy'), 'correct horse battery');
    await user.type(screen.getByLabelText('Как вас называть в семье'), 'Мама');
    await user.click(screen.getByRole('button', { name: 'Подключить и создать семью' }));
    expect(api.bodies['POST /api/auth/connect']).toEqual({
      providerId: 'demo-full',
      credentials: { login: 'diary-user', password: 'x' },
      role: 'parent',
      user: { login: 'parent@example.com', password: 'correct horse battery', displayName: 'Мама' },
      consentVersion: CONSENT_VERSION,
    });
    // a child another family follows: the choice, «Из своей семьи» by default
    expect(await screen.findByText('Ева уже есть в Marksy')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await waitFor(() =>
      expect(api.bodies['POST /api/family/accounts/acc-1/matches/kid-shared']).toEqual({ action: 'follow' }),
    );
    expect(await screen.findByRole('heading', { name: 'С кого начнём?' })).toBeTruthy();
  });

  it('a diary that refuses the login is said about the diary', async () => {
    fakeApi({ diaryRefuses: true });
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Подключить дневник' }));
    await user.type(await screen.findByLabelText('Логин в дневнике'), 'diary-user');
    await user.type(screen.getByLabelText('Пароль от дневника'), 'x');
    await user.type(screen.getByLabelText('Ваш логин в Marksy'), 'parent@example.com');
    await user.type(screen.getByLabelText('Ваш пароль в Marksy'), 'correct horse battery');
    await user.type(screen.getByLabelText('Как вас называть в семье'), 'Мама');
    await user.click(screen.getByRole('button', { name: 'Подключить и создать семью' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Дневник не принял этот логин и пароль.');
  });

  it('an invite link: what it is for, then a name and a Marksy login', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/join/abc123" />);
    await user.click(await screen.findByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Приглашение в семью «Семья»')).toBeTruthy();
    expect(screen.getByText('родителем · Марк')).toBeTruthy();
    await user.type(screen.getByLabelText('Как вас называть в семье'), 'Бабушка');
    await user.type(screen.getByLabelText('Ваш логин в Marksy'), 'gran@example.com');
    await user.type(screen.getByLabelText('Ваш пароль в Marksy'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Войти в семью' }));
    expect(api.bodies['POST /api/invites/ABC123/accept']).toEqual({
      displayName: 'Бабушка',
      login: 'gran@example.com',
      password: 'correct horse battery',
    });
    expect(await screen.findByRole('heading', { name: 'С кого начнём?' })).toBeTruthy();
  });

  it('a wrong invite code says so', async () => {
    fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'У меня есть код приглашения' }));
    await user.type(screen.getByLabelText('Код приглашения'), 'ZZZ999');
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Код приглашения не подошёл/);
  });

  it('the language chosen on the login screen becomes the user language after sign-in', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Язык интерфейса' }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.type(await screen.findByLabelText('Marksy login'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(api.bodies['PATCH /api/me']).toEqual({ locale: 'en' }));
  });
});
