import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, usePeriod } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  usePeriod.setState({ kind: 'week', offset: 0 });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Home', () => {
  it('a child with marks: "Now", the tiles with "was", the last day, Attention, the next day, Statistics', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}`} />);
    // "Now" (nowCard.lesson) above the navigator
    expect(await screen.findByText('Now · lesson 3')).toBeTruthy();
    expect(screen.getByText('room 206 · until 10:40')).toBeTruthy();
    // the brief row
    // the average in its tile (and once more over the last point of Trend)
    expect((await screen.findAllByText('7.4')).length).toBeGreaterThan(0);
    expect(screen.getByText('Average')).toBeTruthy();
    expect(screen.getByText('was 8.2')).toBeTruthy();
    expect(screen.getByText('was 15')).toBeTruthy();
    // the last day: newest first, the work type only when the diary set one
    expect(screen.getByText('Quiz · Пересдача во вторник')).toBeTruthy();
    // Attention: five rows, then "Show all" (home.showAll)
    expect(screen.getByText('5 of 7')).toBeTruthy();
    expect(screen.getByText('Физика: the average is falling')).toBeTruthy();
    expect(screen.getByText('was 6.0, now 4.0 over the week · 2 marks')).toBeTruthy();
    expect(screen.getByText('“Нет домашнего задания”')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all · 7' })).toBeTruthy();
    // the next day: an empty first slot, the second lesson's form, the lab note
    expect(screen.getByText('no lesson')).toBeTruthy();
    expect(screen.getByText('free period')).toBeTruthy();
    expect(screen.getByText('from lesson 2, at 09:25', { exact: false })).toBeTruthy();
    expect(screen.getByText('Lab work')).toBeTruthy();
    // Statistics
    expect(screen.getByRole('heading', { name: 'By band' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Distribution' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Trend' })).toBeTruthy();
  });

  it('a class without marks: lessons and homework instead, no marks blocks, "Lessons are over · tomorrow"', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}`} />);
    expect(await screen.findByText('Lessons')).toBeTruthy();
    expect(screen.getByText('Homework')).toBeTruthy();
    expect(screen.getByText('was 16')).toBeTruthy();
    expect(screen.getByText('Lessons are over')).toBeTruthy();
    expect(screen.getByText('All calm')).toBeTruthy();
    expect(screen.queryByText('Average')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Statistics' })).toBeNull();
  });

  it('"Show all" opens Attention with every row and the note', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}`} />);
    await user.click(await screen.findByRole('button', { name: 'Show all · 7' }));
    expect(await screen.findByRole('heading', { name: 'Attention' })).toBeTruthy();
    const list = (await screen.findAllByText('Absent: Беларуская мова')).length;
    expect(list).toBe(4);
    expect(screen.getByText(/only in the current one/)).toBeTruthy();
  });

  it('the period picker shows each instance with its marks', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}`} />);
    await user.click(await screen.findByRole('button', { name: /This week/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('12 marks')).toBeTruthy();
    expect(within(sheet).getByText('9 marks')).toBeTruthy();
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

  it('a student gets "Close to the goal" after Attention; a tap opens the subject', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: Date.now() }, alwaysLast: false });
    fakeApi({ signedIn: true, role: 'student', overview: { nearGoals: NEAR } });
    render(<App at={`/s/${milena.id}`} />);
    const card = (await screen.findByRole('heading', { name: 'Close to a final of 8' })).closest('section')!;
    expect(card.textContent).toContain('Алгебра 7.3 → 7.5: 1 × 9 more');
    expect(card.textContent).toContain('Физика 7.1 → 7.5: 2 × 10 more');
    await userEvent.setup().click(within(card).getByText('Алгебра'));
    expect(await screen.findByRole('heading', { name: 'Алгебра' })).toBeTruthy();
  });

  it('a parent never sees it, the same answer notwithstanding', async () => {
    fakeApi({ signedIn: true, overview: { nearGoals: NEAR } });
    render(<App at={`/s/${milena.id}`} />);
    expect(await screen.findByText('Now · lesson 3')).toBeTruthy();
    expect(screen.queryByText('Close to a final of 8')).toBeNull();
  });
});
