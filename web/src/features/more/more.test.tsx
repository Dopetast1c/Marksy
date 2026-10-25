import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { FIXTURE_NOW } from '../../test/setup';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});

const [milena] = KIDS as [(typeof KIDS)[number]];

describe('Ещё', () => {
  it('in the documented order: the choice, who is signed in, Школа, the switches, the language, Выйти last', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/more" />);
    expect(await screen.findByText('Родитель (администратор)')).toBeTruthy();
    const titles = [...document.querySelectorAll('main b')].map((b) => b.textContent);
    const order = [
      'Ученик не выбран',
      'Родитель (администратор)',
      'Школа',
      'Подсказки',
      'Всегда начинать с последнего',
      'Язык',
      'Выйти',
    ];
    expect(titles.filter((x) => order.includes(x ?? ''))).toEqual(order);
    expect(screen.getByText('Семья · 2 ученика')).toBeTruthy();
    // no child picked: Школа asks for one first
    await userEvent.setup().click(screen.getByText('Школа'));
    expect(await screen.findByText('С кого начнём?')).toBeTruthy();
  });

  it('«Подсказки» is the person’s own switch, saved at once', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/more" />);
    const guidance = await screen.findByRole('switch', { name: 'Подсказки' });
    expect(guidance.getAttribute('aria-checked')).toBe('true');
    await user.click(guidance);
    expect(api.bodies['PATCH /api/me/settings']).toEqual({ guidance: false });
    expect((await screen.findByRole('switch', { name: 'Подсказки' })).getAttribute('aria-checked')).toBe('false');
  });

  it('with a child picked, Школа opens that child’s school', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: FIXTURE_NOW.getTime() }, alwaysLast: false });
    fakeApi({ signedIn: true });
    render(<App at="/more" />);
    await userEvent.setup().click(await screen.findByText('Милена: звонки, учебный год и каникулы'));
    expect(await screen.findByRole('button', { name: 'Звонки' })).toBeTruthy();
  });
});

describe('Школа', () => {
  it('Звонки: every lesson with its time and length, the breaks between them', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/school`} />);
    expect(await screen.findByText('08:30 – 09:15')).toBeTruthy();
    expect(screen.getAllByText('45 мин').length).toBe(4);
    expect(screen.getAllByText('перемена 10 мин')).toHaveLength(2);
    expect(screen.getByText('перемена 20 мин')).toBeTruthy();
    expect(screen.getByText('пн–пт · 08:30–12:10 · 4 урока')).toBeTruthy();
    expect(screen.getByText(/Звонки класса 7 «Г»/)).toBeTruthy();
  });

  it('Четверти: the term going on, the holidays named from their kind, from Внимание straight to it', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/school?tab=year`} />);
    // today is 21 October: the first term runs, the autumn holidays are next
    const now = await screen.findByText('Сейчас');
    const card = now.closest('section')!;
    expect(within(card).getByText('I четверть')).toBeTruthy();
    expect(within(card).getByText(/осталось 11 дней · до каникул 11 дней/)).toBeTruthy();
    expect(screen.getByText('Осенние каникулы')).toBeTruthy();
    expect(screen.getByText('8 дней')).toBeTruthy();
    expect(screen.getByText('идёт')).toBeTruthy();
  });
});
