import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, useMarkFilter, usePeriod } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Оценки', () => {
  it('days newest first: marks, the absence, the comment, the correction; the finals card; no empty slots', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    expect(await screen.findByText('Квадратные уравнения')).toBeTruthy();
    // the finals entry row while the term runs
    expect(screen.getByText('по четвертям и годам · I четверть идёт, итоги после 31 окт')).toBeTruthy();
    // a work type only when the diary set one: no «·» before the topic, no placeholder
    expect(screen.getByText('Контрольная работа')).toBeTruthy();
    expect(screen.queryByText(/^ · |· $/)).toBeNull();
    // the mark with a comment carries the comment icon
    expect(screen.getByText('Не решены задачи 2 и 3')).toBeTruthy();
    // the absence: «н» in a dashed frame, «пропуск»; the teacher's comment in quotes; a correction
    expect(screen.getByText('н')).toBeTruthy();
    expect(screen.getByText('пропуск')).toBeTruthy();
    expect(screen.getByText('«Нет домашнего задания»')).toBeTruthy();
    expect(screen.getByText('исправлена, было 6')).toBeTruthy();
    // in a day the marks come first, then the absence, then the comment
    const day = screen.getByText('Квадратные уравнения').closest('section')!;
    const text = day.textContent!;
    expect(text.indexOf('Физика')).toBeLessThan(text.indexOf('пропуск'));
    expect(text.indexOf('пропуск')).toBeLessThan(text.indexOf('Нет домашнего задания'));
    // the finals card: one card, how many differ, never in the averages
    expect(screen.getByText('Итоги I четверти')).toBeTruthy();
    expect(
      screen.getByText('1 предмет · 1 итог отличается от округлённого среднего · итоги не входят в средний балл'),
    ).toBeTruthy();
    // the mark of a day without a work type or topic has a single line
    const geometry = screen.getByText('Геометрия').closest('button')!;
    expect(within(geometry).getAllByText(/./).length).toBeLessThanOrEqual(2);
    // «Все итоги» opens Итоги
    await userEvent.click(screen.getByRole('button', { name: 'Все итоги' }));
    expect(await screen.findByRole('heading', { name: 'Итоги' })).toBeTruthy();
  });

  it('Комментарии asks for the teacher’s comments only; a child whose diary has none gets no filter row', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    await screen.findByText('Квадратные уравнения');
    expect(screen.getByRole('button', { name: 'Все', pressed: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Комментарии' }));
    await waitFor(() => expect(api.urls.some((u) => u.includes('/marks?') && u.includes('comments=only'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Комментарии', pressed: true })).toBeTruthy();
  });

  it('the shared filter never strands a child without comments: no row, all marks asked for', async () => {
    useMarkFilter.setState({ comments: true });
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/marks`} />);
    expect(await screen.findByText('В этом классе отметки не ставят.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Какие оценки' })).toBeNull();
    expect(api.urls.find((u) => u.includes('/marks?'))).toContain('comments=all');
  });
});

describe('Оценки, the next page', () => {
  it('comes by itself when the end of the list is near', async () => {
    // a browser that reports the end of the list as near at once
    class Near {
      constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.cb([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Near);
    const api = fakeApi({ signedIn: true, feedPages: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    expect(await screen.findByText('Понедельник')).toBeTruthy();
    expect(api.urls.some((u) => u.includes('/marks?') && u.includes('cursor=100'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('or with «Показать ещё» where the browser cannot tell', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    fakeApi({ signedIn: true, feedPages: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findByText('Понедельник')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('Итоги', () => {
  it('Четверти: the legend first, a framed final, an italic running average, last year under the subject', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/finals`} />);
    expect(await screen.findByText('2026/27 · 7 «Г»')).toBeTruthy();
    expect(screen.getByText('I четверть идёт, итоги после 31 окт')).toBeTruthy();
    expect(screen.getByText(/^Целое число в рамке — итог/)).toBeTruthy();
    expect(screen.getByText('итог 2025/26: 7')).toBeTruthy();
    expect(screen.getByText('новый предмет')).toBeTruthy();
    // the teacher's final is a chip; the year until it is posted is a calculation in italics
    const algebra = screen.getByText('Алгебра').closest('button')!;
    expect(within(algebra).getByText('8').className).toContain('font-extrabold');
    expect(within(algebra).getByText('8,0').className).toContain('italic');
    const geometry = screen.getByText('Геометрия').closest('button')!;
    expect(within(geometry).getByText('6,4').className).toContain('italic');
    expect(within(geometry).getAllByText('–').length).toBe(2);
  });

  it('Годы: a subject not taught this year, a new one, the arrow against last year', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/finals`} />);
    await screen.findByText('Алгебра');
    await userEvent.click(screen.getByRole('button', { name: 'Годы' }));
    expect(await screen.findByText('в этом году нет')).toBeTruthy();
    expect(screen.getByText('новый предмет')).toBeTruthy();
    expect(screen.getByText('2025/26')).toBeTruthy();
    expect(screen.getByText('лучше')).toBeTruthy();
  });

  it('Годы: a past year typed in from the report card, marked «введено вручную», saved as a whole', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}/finals?mode=years`} />);
    expect(await screen.findByText(/Значком ручки отмечены итоги, введённые вручную/)).toBeTruthy();
    expect(screen.getAllByText('введено вручную').length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Ввести итоги прошлого года' }));
    const sheet = await screen.findByRole('dialog', { name: 'Итоги прошлого года' });
    // the diary's own year is not offered, only as many years back as Годы shows; the year typed in opens with its
    // values
    const years = within(sheet).getByRole('group', { name: 'Учебный год' });
    expect(
      within(years)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['2025/26', '2024/25']);
    // a subject opens the scale's values under it: no native select (D32)
    expect(within(sheet).queryByRole('combobox')).toBeNull();
    const pick = async (subject: string, value: string) => {
      await user.click(within(sheet).getByRole('button', { name: new RegExp(`^${subject}`) }));
      await user.click(
        within(within(sheet).getByRole('group', { name: subject })).getByRole('button', { name: value }),
      );
    };
    await user.click(within(sheet).getByRole('button', { name: /^Алгебра/ }));
    expect(
      within(within(sheet).getByRole('group', { name: 'Алгебра' })).getByRole('button', { pressed: true }).textContent,
    ).toBe('7');
    await user.click(within(sheet).getByRole('button', { name: /^Алгебра/ }));
    await pick('Геометрия', '9');
    await pick('Природоведение', '—');
    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));
    expect(api.bodies['PUT /api/students/kid-milena/final-marks']).toEqual({
      startYear: 2025,
      marks: [
        { subjectName: 'Алгебра', raw: '7' },
        { subjectName: 'Геометрия', raw: '9' },
      ],
    });
  });

  it('a student sees the years but types nothing in', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: Date.now() }, alwaysLast: false });
    fakeApi({ signedIn: true, role: 'student' });
    render(<App at={`/s/${milena.id}/finals?mode=years`} />);
    expect(await screen.findByText('в этом году нет')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ввести итоги прошлого года' })).toBeNull();
  });
});
