import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, useScheduleView } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  useScheduleView.setState({ kind: 'day', day: null, week: 0 });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];
// the fixtures' clock: Wednesday 21 October 2026, 19:12 at the school (test/setup.ts)
const tomorrow = `/s/${milena.id}/schedule?day=2026-10-22`;

const menuButtons = () => screen.queryAllByRole('button', { name: 'Действия с уроком' });

describe('Расписание', () => {
  it('a day ahead: the late start, the gaps, the counts, «Обратить внимание» and the пометки', async () => {
    fakeApi({ signedIn: true });
    render(<App at={tomorrow} />);
    expect(await screen.findByText('Ко 2-му уроку, к 09:25')).toBeTruthy();
    expect(screen.getByText('Завтра')).toBeTruthy();
    expect(screen.getByText('урока нет')).toBeTruthy();
    expect(screen.getByText('окно')).toBeTruthy();
    expect(screen.getByText('готово 0 из 2')).toBeTruthy();
    expect(screen.getByText('1 контрольная')).toBeTruthy();
    // «Обратить внимание»: the tag, the subject, which lesson, the diary's words
    const attention = screen.getByRole('region', { name: 'Обратить внимание' });
    expect(within(attention).getByText('Контрольная · Физика')).toBeTruthy();
    expect(within(attention).getByText('завтра, 4 урок')).toBeTruthy();
    expect(within(attention).getByText('тема: К/р №2 по теме «Сила тока»')).toBeTruthy();
    // the пометки of an upcoming lesson: subgroup, факты, сигнал; подсказка with the action first
    expect(screen.getByText('каб. 206 · 2-я подгруппа')).toBeTruthy();
    expect(screen.getByText('Средняя оценка:')).toBeTruthy();
    expect(screen.getByText('Давно без оценки, могут спросить')).toBeTruthy();
    expect(screen.getByText('5 уроков без оценки; можно вызваться', { exact: false })).toBeTruthy();
    expect(screen.getByText('Последняя оценка: 14 окт, 5 уроков назад')).toBeTruthy();
    expect(screen.getByText('Повторить то, что не получилось')).toBeTruthy();
    expect(screen.getByText('Оценок по предмету в этом году ещё нет')).toBeTruthy();
    expect(screen.getByText('Лабораторная работа')).toBeTruthy();
    expect(menuButtons()).toHaveLength(2);
  });

  it('a day that has passed keeps only the mark, the absence and the teacher’s comment; no ⋯ menu', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/schedule?day=2026-10-21`} />);
    expect(await screen.findByText('Оценка за урок:')).toBeTruthy();
    expect(screen.getByText('«Аккуратная работа»')).toBeTruthy();
    expect(screen.getByText('Пропуск урока')).toBeTruthy();
    expect(screen.getByText('Учитель: «Нет домашнего задания»')).toBeTruthy();
    expect(screen.queryByText('Средняя оценка:')).toBeNull();
    expect(menuButtons()).toHaveLength(0);
    // no «готово N из M»: nothing is ahead
    expect(screen.queryByText(/готово \d из/)).toBeNull();
  });

  it('the ⋯ menu: «готово» first, then homework, then «Урока не будет»; a choice changes the row at once', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('Ко 2-му уроку, к 09:25');
    await user.click(menuButtons()[0]!);
    const sheet = screen.getByRole('dialog', { name: 'Алгебра · 2 урок, завтра 09:25' });
    const titles = within(sheet)
      .getAllByRole('button')
      .map((b) => b.querySelector('b')?.textContent);
    // Алгебра has the diary's homework: no «Добавить задание»
    expect(titles).toEqual(['Отметить «готово»', 'Урока не будет']);
    await user.click(within(sheet).getByText('Отметить «готово»'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Готово')).toBeTruthy();
    expect(api.calls).toContain('PUT /api/students/kid-milena/lessons/l2/prep');
    expect(await screen.findByText('готово 1 из 2')).toBeTruthy();

    // own homework on a lesson the diary has none for
    await user.click(menuButtons()[1]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Добавить задание'));
    await user.type(screen.getByPlaceholderText('Что задали: параграф, номера, выучить…'), 'Параграф 12');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(api.bodies['POST /api/students/kid-milena/lessons/l4/homework']).toEqual({ text: 'Параграф 12' });
    expect(await screen.findByText('Параграф 12')).toBeTruthy();

    // «Урока не будет»: struck through, out of the counts and of «Обратить внимание»; «Вернуть урок» only
    await user.click(menuButtons()[1]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Урока не будет'));
    expect(await screen.findByText('1 не будет', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Обратить внимание' })).toBeNull();
    await user.click(menuButtons()[1]!);
    const back = screen.getByRole('dialog');
    expect(
      within(back)
        .getAllByRole('button')
        .map((b) => b.querySelector('b')?.textContent),
    ).toEqual(['Вернуть урок']);
  });

  it('a refused action brings the sheet back with the reason', async () => {
    fakeApi({ signedIn: true, lessonRefuses: 'lesson_passed' });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('Ко 2-му уроку, к 09:25');
    await user.click(menuButtons()[0]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Отметить «готово»'));
    expect(await screen.findByText('Урок уже прошёл: менять больше нечего.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('the navigator steps over days without lessons and goes forward; Неделя lists every day', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('Завтра');
    await user.click(screen.getByRole('button', { name: 'Следующий период' }));
    expect(await screen.findByText('Пятница')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Следующий период' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Неделя' }));
    expect(await screen.findByText('Эта неделя')).toBeTruthy();
    expect(screen.getByText('Сегодня')).toBeTruthy();
    expect(screen.getAllByText('Пятница').length).toBeGreaterThan(0);
  });

  it('on a day without lessons День opens on the next day with lessons', async () => {
    // the school's today is Sunday 18 October: the next day with lessons in the fixtures is Wednesday 21 October
    const api = fakeApi({ signedIn: true, scheduleToday: '2026-10-18' });
    render(<App at={`/s/${milena.id}/schedule`} />);
    expect(await screen.findByText('Учитель: «Нет домашнего задания»')).toBeTruthy();
    expect(api.urls).toContain('GET /api/students/kid-milena/schedule?day=2026-10-21');
  });

  it('a diary without a timetable: an empty state, the tab stays for the other child', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/schedule`} />);
    expect(await screen.findByText('В дневнике нет расписания')).toBeTruthy();
    // the title only: no День / Неделя and no navigator with dead arrows
    expect(screen.queryByRole('button', { name: 'День' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Следующий период' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Расписание' })).toBeTruthy();
  });
});
