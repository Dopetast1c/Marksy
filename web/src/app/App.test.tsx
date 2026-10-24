import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { PICK_AFTER_MS } from '../lib/pick';
import { useDevice, usePeriod } from '../state/store';
import { fakeApi, KIDS } from '../test/fake-api';
import { App } from './App';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  usePeriod.setState({ kind: 'week', offset: 0 });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('the shell', () => {
  it('no session: the login; signing in leads to «С кого начнём?», then Главная of the picked child', async () => {
    fakeApi();
    const user = userEvent.setup();
    render(<App at="/" />);
    await user.type(await screen.findByLabelText('Логин Marksy'), 'parent@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Неверный логин или пароль.');
    await user.clear(screen.getByLabelText('Пароль'));
    await user.type(screen.getByLabelText('Пароль'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await user.click(await screen.findByRole('button', { name: /Марк/ }));
    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeTruthy();
    expect(screen.getByText('Марк · 1 «Д»')).toBeTruthy();
    expect(await screen.findByText('Эта неделя')).toBeTruthy();
  });

  it('the child chosen within 12 hours is kept; after 12 hours the picker comes back', async () => {
    fakeApi({ signedIn: true });
    useDevice.setState({ pick: { id: milena.id, lastActive: Date.now() - PICK_AFTER_MS + 60_000 }, alwaysLast: false });
    const first = render(<App at="/" />);
    expect(await screen.findByText('Милена · 7 «Г»')).toBeTruthy();
    first.unmount();
    useDevice.setState({ pick: { id: milena.id, lastActive: Date.now() - PICK_AFTER_MS - 60_000 } });
    render(<App at="/" />);
    expect(await screen.findByRole('heading', { name: 'С кого начнём?' })).toBeTruthy();
  });

  it('switching the child keeps the screen and the period', async () => {
    fakeApi({ signedIn: true });
    usePeriod.setState({ kind: 'week', offset: 0 });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}/events`} />);
    expect(await screen.findByRole('heading', { name: 'Внимание' })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Предыдущий период' }));
    expect(await screen.findByText('Прошлая неделя')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: mark.name }));
    await waitFor(() => expect(screen.getByText('Марк · 1 «Д»')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Внимание' })).toBeTruthy();
    expect(screen.getByText('Прошлая неделя')).toBeTruthy();
  });

  it('a child this person does not see is never opened', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/s/someone-else" />);
    expect(await screen.findByRole('heading', { name: 'С кого начнём?' })).toBeTruthy();
  });
});
