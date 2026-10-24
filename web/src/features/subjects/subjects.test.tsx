import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useMarkFilter, usePeriod, useSubjectSort } from '../../state/store';
import { fakeApi, KIDS, SUBJECT } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
  useSubjectSort.setState({ sort: 'alpha' });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Предметы', () => {
  it('every subject: last marks, the average with "было", a dash and words when there are none; the order sheet', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects`} />);
    const algebra = (await screen.findByText('Алгебра')).closest('button')!;
    expect(within(algebra).getByText('7,5')).toBeTruthy();
    expect(within(algebra).getByText('было 8,5')).toBeTruthy();
    const english = screen.getByText('Английский язык').closest('button')!;
    expect(within(english).getByText('углубл.')).toBeTruthy();
    expect(within(english).getByText('—')).toBeTruthy();
    expect(within(english).getByText('нет оценок за неделю')).toBeTruthy();
    expect(screen.getByText(/^Стрелка сравнивает/)).toBeTruthy();
    // the order is a sheet, never a native select
    await userEvent.click(screen.getByRole('button', { name: 'Порядок предметов' }));
    const sheet = screen.getByRole('dialog', { name: 'Порядок предметов' });
    expect(within(sheet).getAllByText('по среднему за период')).toHaveLength(2);
    await userEvent.click(within(sheet).getByRole('button', { name: /Сначала слабые/ }));
    await waitFor(() => expect(api.urls.some((u) => u.includes('/subjects?') && u.includes('sort=weak'))).toBe(true));
  });

  it('with Комментарии a row counts the teacher’s comments, never says there are no marks', async () => {
    useMarkFilter.setState({ comments: true });
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects`} />);
    expect(await screen.findByText('2 комментария')).toBeTruthy();
    expect(screen.getByText('нет комментариев')).toBeTruthy();
    expect(screen.queryByText('нет оценок за неделю')).toBeNull();
  });

  it('a class without marks: lessons and homework, the next lesson, no filter and no order', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/subjects`} />);
    expect(await screen.findByText('5 уроков · 3 задания')).toBeTruthy();
    expect(screen.getByText(/^дальше: .*2 урок · с\. 14, № 3$/)).toBeTruthy();
    expect(screen.getByText(/^В этом классе отметки не ставят/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Порядок предметов' })).toBeNull();
    expect(screen.queryByText('Итоговые отметки')).toBeNull();
  });
});

describe('Предмет', () => {
  it('settings line, «О предмете», the goal row and a hint, the marks, the coming lessons, the term strip', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    expect(await screen.findByRole('heading', { name: 'Алгебра' })).toBeTruthy();
    expect(screen.getByText('цель: итог 8 · цвет: синий')).toBeTruthy();
    expect(screen.getByText('Учитель Алгебры')).toBeTruthy();
    expect(screen.getByText(/^пн 2-й · каб\. 305$/)).toBeTruthy();
    // the goal: what is missing, best marks first
    expect(screen.getByText('Цель итог 8: ещё 1 × 10 или 2 × 9')).toBeTruthy();
    expect(screen.getByText('сейчас выходит 7, средний за четверть 7,1, нужен 7,5')).toBeTruthy();
    // a low mark without a work type: no empty slot before the date
    expect(screen.getByText('Оценка 3, вт, 13 окт')).toBeTruthy();
    expect(screen.getByText('Разобрать работу на 3')).toBeTruthy();
    expect(screen.getByText('Квадратные уравнения', { exact: false })).toBeTruthy();
    expect(screen.getByText('Ближайшие уроки')).toBeTruthy();
    // Marksy has last year and the subject was not in it
    expect(screen.getByText('новый предмет в этом году')).toBeTruthy();
    expect(screen.getByText('7,1').className).toContain('italic');
  });

  it('switching the child opens their subject of the same name, else their subjects', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/subjects/sub-ma`} />);
    await screen.findByRole('heading', { name: 'Алгебра' });
    // Milena has an «Алгебра»: her own subject opens
    await userEvent.click(screen.getByRole('tab', { name: milena.name }));
    await waitFor(() => expect(screen.getByText('цель: итог 8 · цвет: синий')).toBeTruthy());
    expect(screen.getByRole('tab', { name: milena.name, selected: true })).toBeTruthy();
    // Марк has none: his list opens
    await userEvent.click(screen.getByRole('tab', { name: mark.name }));
    expect(await screen.findByText('5 уроков · 3 задания')).toBeTruthy();
  });

  it('guidance off: no «Обратить внимание», the goal still shown in the settings', async () => {
    fakeApi({ signedIn: true, subject: { ...SUBJECT, attention: { goal: null, hints: [] } } });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    expect(await screen.findByText('цель: итог 8 · цвет: синий')).toBeTruthy();
    expect(screen.queryByText('Обратить внимание')).toBeNull();
  });

  it('the settings sheet: a goal from the scale, «Без цели», a colour or «Авто», saved at once', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    await userEvent.click(await screen.findByRole('button', { name: /Настройки предмета/ }));
    const sheet = screen.getByRole('dialog', { name: 'Алгебра: настройки' });
    // every whole value of the scale, 1 to 10 on by-10
    expect(within(sheet).getAllByRole('button', { pressed: false }).length).toBeGreaterThan(9);
    expect(within(sheet).getByRole('button', { name: '8', pressed: true })).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: '9' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/goal']).toEqual({ termGoal: 9 }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Без цели' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/goal']).toEqual({ termGoal: null }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Красный' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/color']).toEqual({ color: 'red' }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: /Авто/ }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/color']).toEqual({ color: null }),
    );
  });
});
