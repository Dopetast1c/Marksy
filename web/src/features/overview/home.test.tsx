import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, usePeriod } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  usePeriod.setState({ kind: 'week', offset: 0 });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Главная', () => {
  it('a child with marks: «Сейчас», the tiles with "было", the last day, Внимание, the next day, Статистика', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}`} />);
    // «Сейчас» above the navigator
    expect(await screen.findByText('Сейчас · 3-й урок')).toBeTruthy();
    expect(screen.getByText('каб. 206 · до 10:40')).toBeTruthy();
    // the brief row
    // the average in its tile (and once more over the last point of Динамика)
    expect((await screen.findAllByText('7,4')).length).toBeGreaterThan(0);
    expect(screen.getByText('Средний балл')).toBeTruthy();
    expect(screen.getByText('было 8,2')).toBeTruthy();
    expect(screen.getByText('было 15')).toBeTruthy();
    // the last day: newest first, the work type only when the diary set one
    expect(screen.getByText('Самостоятельная работа · Пересдача во вторник')).toBeTruthy();
    // Внимание: five rows, then «Показать все»
    expect(screen.getByText('5 из 7')).toBeTruthy();
    expect(screen.getByText('Физика: средний падает')).toBeTruthy();
    expect(screen.getByText('было 6,0, стало 4,0 за неделю · 2 оценки')).toBeTruthy();
    expect(screen.getByText('«Нет домашнего задания»')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Показать все · 7' })).toBeTruthy();
    // the next day: an empty first slot, the second lesson's form, the lab note
    expect(screen.getByText('урока нет')).toBeTruthy();
    expect(screen.getByText('окно')).toBeTruthy();
    expect(screen.getByText('ко 2-му, к 09:25', { exact: false })).toBeTruthy();
    expect(screen.getByText('Лабораторная работа')).toBeTruthy();
    // Статистика
    expect(screen.getByRole('heading', { name: 'По градациям' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Распределение' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Динамика' })).toBeTruthy();
  });

  it('a class without marks: lessons and homework instead, no marks blocks, «Уроки закончились · завтра»', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}`} />);
    expect(await screen.findByText('Уроков')).toBeTruthy();
    expect(screen.getByText('Заданий')).toBeTruthy();
    expect(screen.getByText('было 16')).toBeTruthy();
    expect(screen.getByText('Уроки закончились')).toBeTruthy();
    expect(screen.getByText('Всё спокойно')).toBeTruthy();
    expect(screen.queryByText('Средний балл')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Статистика' })).toBeNull();
  });

  it('«Показать все» opens Внимание with every row and the note', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}`} />);
    await user.click(await screen.findByRole('button', { name: 'Показать все · 7' }));
    expect(await screen.findByRole('heading', { name: 'Внимание' })).toBeTruthy();
    const list = (await screen.findAllByText('Пропуск: Беларуская мова')).length;
    expect(list).toBe(4);
    expect(screen.getByText(/только для текущего периода/)).toBeTruthy();
  });

  it('the period picker shows each instance with its marks', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}`} />);
    await user.click(await screen.findByRole('button', { name: /Эта неделя/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('12 оценок')).toBeTruthy();
    expect(within(sheet).getByText('9 оценок')).toBeTruthy();
  });

  const NEAR = [
    {
      subject: { id: 'sub-al', name: 'Алгебра', color: 'blue' },
      target: 8,
      average: 7.3,
      need: 7.5,
      plan: { value: 9, count: 1 },
    },
    {
      subject: { id: 'sub-ph', name: 'Физика', color: null },
      target: 8,
      average: 7.1,
      need: 7.5,
      plan: { value: 10, count: 2 },
    },
  ];

  it('a student gets «Близко к цели» after Внимание; a tap opens the subject', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: Date.now() }, alwaysLast: false });
    fakeApi({ signedIn: true, role: 'student', overview: { nearGoals: NEAR } });
    render(<App at={`/s/${milena.id}`} />);
    const card = (await screen.findByRole('heading', { name: 'Близко к итогу 8' })).closest('section')!;
    expect(card.textContent).toContain('Алгебра 7,3 → 7,5: ещё 1 × 9');
    expect(card.textContent).toContain('Физика 7,1 → 7,5: ещё 2 × 10');
    await userEvent.setup().click(within(card).getByText('Алгебра'));
    expect(await screen.findByRole('heading', { name: 'Алгебра' })).toBeTruthy();
  });

  it('a parent never sees it, the same answer notwithstanding', async () => {
    fakeApi({ signedIn: true, overview: { nearGoals: NEAR } });
    render(<App at={`/s/${milena.id}`} />);
    expect(await screen.findByText('Сейчас · 3-й урок')).toBeTruthy();
    expect(screen.queryByText('Близко к итогу 8')).toBeNull();
  });
});
