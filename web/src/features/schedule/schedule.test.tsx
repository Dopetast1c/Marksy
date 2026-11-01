import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, useScheduleView } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  useScheduleView.setState({ kind: 'day', day: null, week: 0 });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];
// the fixtures' clock: Wednesday 21 October 2026, 19:12 at the school (test/setup.ts)
const tomorrow = `/s/${milena.id}/schedule?day=2026-10-22`;

const menuButtons = () => screen.queryAllByRole('button', { name: 'Lesson actions' });

describe('Timetable', () => {
  it('a day ahead: the late start, the gaps, the counts, "Worth a look" and the lesson notes', async () => {
    fakeApi({ signedIn: true });
    render(<App at={tomorrow} />);
    expect(await screen.findByText('From lesson 2, at 09:25')).toBeTruthy();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
    expect(screen.getByText('no lesson')).toBeTruthy();
    expect(screen.getByText('free period')).toBeTruthy();
    expect(screen.getByText('ready 0 of 2')).toBeTruthy();
    expect(screen.getByText('1 test')).toBeTruthy();
    // "Worth a look" (subject.attention): the tag, the subject, which lesson, the diary's words
    const attention = screen.getByRole('region', { name: 'Worth a look' });
    expect(within(attention).getByText('Контрольная · Физика')).toBeTruthy();
    expect(within(attention).getByText('tomorrow, lesson 4')).toBeTruthy();
    expect(within(attention).getByText('topic: К/р №2 по теме «Сила тока»')).toBeTruthy();
    // the notes of an upcoming lesson: subgroup, facts, signal; the tip with the action first
    expect(screen.getByText('room 206 · 2-я подгруппа')).toBeTruthy();
    expect(screen.getByText('Average mark:')).toBeTruthy();
    expect(screen.getByText('No mark for a while, may be asked')).toBeTruthy();
    expect(screen.getByText('5 lessons without a mark; a chance to volunteer', { exact: false })).toBeTruthy();
    expect(screen.getByText('Last mark: 14 Oct, 5 lessons ago')).toBeTruthy();
    expect(screen.getByText('Go over what did not work last time')).toBeTruthy();
    expect(screen.getByText('No marks in this subject this year yet')).toBeTruthy();
    expect(screen.getByText('Lab work')).toBeTruthy();
    expect(menuButtons()).toHaveLength(2);
  });

  it('a day that has passed keeps only the mark, the absence and the teacher’s comment; no ⋯ menu', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/schedule?day=2026-10-21`} />);
    expect(await screen.findByText('Mark for the lesson:')).toBeTruthy();
    expect(screen.getByText('“Аккуратная работа”')).toBeTruthy();
    expect(screen.getByText('Missed the lesson')).toBeTruthy();
    expect(screen.getByText('Teacher: “Нет домашнего задания”')).toBeTruthy();
    expect(screen.queryByText('Average mark:')).toBeNull();
    expect(menuButtons()).toHaveLength(0);
    // no "ready N of M" (schedule.ready): nothing is ahead
    expect(screen.queryByText(/ready \d of/)).toBeNull();
  });

  it('the ⋯ menu: "ready" first, then homework, then "Lesson won’t take place"; a choice changes the row at once', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('From lesson 2, at 09:25');
    await user.click(menuButtons()[0]!);
    const sheet = screen.getByRole('dialog', { name: 'Алгебра · lesson 2, tomorrow 09:25' });
    const titles = within(sheet)
      .getAllByRole('button')
      .map((b) => b.querySelector('b')?.textContent);
    // the lesson has the diary's homework: no "Add homework" (lessonMenu.addHomework)
    expect(titles).toEqual(['Mark as ready', 'Lesson won’t take place']);
    await user.click(within(sheet).getByText('Mark as ready'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(api.calls).toContain('PUT /api/students/kid-milena/lessons/l2/prep');
    expect(await screen.findByText('ready 1 of 2')).toBeTruthy();

    // own homework on a lesson the diary has none for
    await user.click(menuButtons()[1]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Add homework'));
    await user.type(screen.getByPlaceholderText('What was set: a section, exercises, learn by heart…'), 'Параграф 12');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.bodies['POST /api/students/kid-milena/lessons/l4/homework']).toEqual({ text: 'Параграф 12' });
    expect(await screen.findByText('Параграф 12')).toBeTruthy();

    // "Lesson won’t take place": struck through, out of the counts and of "Worth a look"; "Bring the lesson back" only
    await user.click(menuButtons()[1]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Lesson won’t take place'));
    expect(await screen.findByText('1 cancelled', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Worth a look' })).toBeNull();
    await user.click(menuButtons()[1]!);
    const back = screen.getByRole('dialog');
    expect(
      within(back)
        .getAllByRole('button')
        .map((b) => b.querySelector('b')?.textContent),
    ).toEqual(['Bring the lesson back']);
  });

  it('a refused action brings the sheet back with the reason', async () => {
    fakeApi({ signedIn: true, lessonRefuses: 'lesson_passed' });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('From lesson 2, at 09:25');
    await user.click(menuButtons()[0]!);
    await user.click(within(screen.getByRole('dialog')).getByText('Mark as ready'));
    expect(await screen.findByText('The lesson has already passed: nothing to change any more.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('the navigator steps over days without lessons and goes forward; Week lists every day', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={tomorrow} />);
    await screen.findByText('Tomorrow');
    await user.click(screen.getByRole('button', { name: 'Next period' }));
    expect(await screen.findByText('Friday')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next period' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(await screen.findByText('This week')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getAllByText('Friday').length).toBeGreaterThan(0);
  });

  it('on a day without lessons Day opens on the next day with lessons', async () => {
    // the school's today is Sunday 18 October: the next day with lessons in the fixtures is Wednesday 21 October
    const api = fakeApi({ signedIn: true, scheduleToday: '2026-10-18' });
    render(<App at={`/s/${milena.id}/schedule`} />);
    expect(await screen.findByText('Teacher: “Нет домашнего задания”')).toBeTruthy();
    expect(api.urls).toContain('GET /api/students/kid-milena/schedule?day=2026-10-21');
  });

  it('a diary without a timetable: an empty state, the tab stays for the other child', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/schedule`} />);
    expect(await screen.findByText('This diary has no timetable')).toBeTruthy();
    // the title only: no Day / Week and no navigator with dead arrows
    expect(screen.queryByRole('button', { name: 'Day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next period' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Timetable' })).toBeTruthy();
  });
});
