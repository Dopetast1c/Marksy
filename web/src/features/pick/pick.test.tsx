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

describe('«С кого начнём?»', () => {
  it('a card per child: marks with "было", or tomorrow for a class without marks; the school-day line; no tag line yet', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/pick" />);
    const milena = await screen.findByRole('button', { name: /Милена/ });
    expect(within(milena).getByText('Новых')).toBeTruthy();
    expect(within(milena).getByText('7,4')).toBeTruthy();
    expect(within(milena).getByText('было 8,2')).toBeTruthy();
    expect(within(milena).getByText('Пропуски')).toBeTruthy();
    expect(within(milena).getByText('3-й урок, до 10:40')).toBeTruthy();
    const mark = screen.getByRole('button', { name: /Марк/ });
    // the next school day, Monday 26 Oct: "завтра" on the Sunday before, its weekday on any other day
    expect(within(mark).getByText(/^Уроков( завтра|, пн)$/)).toBeTruthy();
    expect(within(mark).getByText('3')).toBeTruthy();
    expect(within(mark).queryByText('Новых')).toBeNull();
    // until tags exist (M6) the card says nothing about them
    expect(screen.queryByText(/с тегами/)).toBeNull();
  });

  it('«Всегда начинать с последнего» is kept on the device; «Настройки» opens Ещё without a child', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/pick" />);
    await user.click(await screen.findByRole('switch', { name: 'Всегда начинать с последнего' }));
    expect(useDevice.getState().alwaysLast).toBe(true);
    await user.click(screen.getByRole('button', { name: /Настройки/ }));
    expect(await screen.findByRole('heading', { name: 'Ещё' })).toBeTruthy();
    expect(screen.getByText('Ученик не выбран')).toBeTruthy();
  });
});
