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
    // the periods' word comes from the provider's term kind
    await userEvent.setup().click(await screen.findByText('Милена: звонки, четверти и каникулы'));
    expect(await screen.findByRole('button', { name: 'Звонки' })).toBeTruthy();
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
    expect(await screen.findByText('3 участника · Милена, Марк · 1 дневник')).toBeTruthy();
    expect(await screen.findByText(/^Сегодня в 12:17 · следующая около 20:00$/)).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText(/^Marksy \d+\.\d+\.\d+ · дневник только читается/)).toBeTruthy();
    unmount();
    // a problem says itself instead of the times
    fakeApi({
      signedIn: true,
      syncStatus: { accounts: [{ id: 'acc-1', status: 'auth_failed', studentIds: ['kid-milena'] }], students: [] },
    });
    const { unmount: done } = render(<App at="/more" />);
    // a problem in the warning colour
    expect((await screen.findByText('Нужен новый пароль')).className).toContain('text-band-critical-fg');
    done();
  });

  it('the next run on another day: its date and time; across holidays «после каникул»; a run in progress is neutral', async () => {
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
      /^Сегодня в 12:17 · следующая пн, 26 окт в 08:13$/,
    );
    await shown(
      account({ kind: 'nextSchoolDay', date: '2026-11-09', afterHolidays: true }),
      /^Сегодня в 12:17 · следующая после каникул, пн, 9 ноя$/,
    );
    await shown(account({ kind: 'nextSchoolDay' }), /^Сегодня в 12:17 · следующая в учебный день$/);
    const reading = await shown(account({ kind: 'now' }, 'loading'), /^Читаем дневник$/);
    expect(reading.className).not.toContain('band');
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
