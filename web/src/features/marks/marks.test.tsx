import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, useMarkFilter, usePeriod } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Marks', () => {
  it('days newest first: marks, the absence, the comment, the correction; the finals card; no empty slots', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    expect(await screen.findByText('Квадратные уравнения')).toBeTruthy();
    // the finals entry row while the term runs
    expect(screen.getByText('by quarter and year · Quarter I is on, finals after 31 Oct')).toBeTruthy();
    // a work type only when the diary set one: no "·" before the topic, no placeholder
    expect(screen.getByText('Test')).toBeTruthy();
    expect(screen.queryByText(/^ · |· $/)).toBeNull();
    // the mark with a comment carries the comment icon
    expect(screen.getByText('Не решены задачи 2 и 3')).toBeTruthy();
    // the absence: the diary's own code (the fixture's, fictional data) in a dashed frame, "absent" (marks.absence);
    // the teacher's comment in quotes; a correction
    expect(screen.getByText('н')).toBeTruthy();
    expect(screen.getByText('absent')).toBeTruthy();
    expect(screen.getByText('“Нет домашнего задания”')).toBeTruthy();
    expect(screen.getByText('corrected, was 6')).toBeTruthy();
    // in a day the marks come first, then the absence, then the comment
    const day = screen.getByText('Квадратные уравнения').closest('section')!;
    const text = day.textContent!;
    expect(text.indexOf('Физика')).toBeLessThan(text.indexOf('absent'));
    expect(text.indexOf('absent')).toBeLessThan(text.indexOf('Нет домашнего задания'));
    // the finals card: one card, how many differ, never in the averages
    expect(screen.getByText('Quarter I finals')).toBeTruthy();
    expect(
      screen.getByText('1 subject · 1 final differs from the rounded average · finals are not part of the averages'),
    ).toBeTruthy();
    // the mark of a day without a work type or topic has a single line
    const geometry = screen.getByText('Геометрия').closest('button')!;
    expect(within(geometry).getAllByText(/./).length).toBeLessThanOrEqual(2);
    // "All finals" (finals.all) opens Finals
    await userEvent.click(screen.getByRole('button', { name: 'All finals' }));
    expect(await screen.findByRole('heading', { name: 'Finals' })).toBeTruthy();
  });

  it('Comments asks for the teacher’s comments only; a child whose diary has none gets no filter row', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    await screen.findByText('Квадратные уравнения');
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Comments' }));
    await waitFor(() => expect(api.urls.some((u) => u.includes('/marks?') && u.includes('comments=only'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Comments', pressed: true })).toBeTruthy();
  });

  it('the shared filter never strands a child without comments: no row, all marks asked for', async () => {
    useMarkFilter.setState({ comments: true });
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/marks`} />);
    expect(await screen.findByText('This class gets no marks.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Which marks' })).toBeNull();
    expect(api.urls.find((u) => u.includes('/marks?'))).toContain('comments=all');
  });
});

describe('Marks, the next page', () => {
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
    expect(await screen.findByText('Monday')).toBeTruthy();
    expect(api.urls.some((u) => u.includes('/marks?') && u.includes('cursor=100'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('or with "Show more" (marks.more) where the browser cannot tell', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    fakeApi({ signedIn: true, feedPages: true });
    render(<App at={`/s/${milena.id}/marks`} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Monday')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('Finals', () => {
  it('Quarters: the legend first, a framed final, an italic running average, last year under the subject', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/finals`} />);
    expect(await screen.findByText('2026/27 · 7 «Г»')).toBeTruthy();
    expect(screen.getByText('Quarter I is on, finals after 31 Oct')).toBeTruthy();
    expect(screen.getByText(/^A whole number in a frame is the final/)).toBeTruthy();
    expect(screen.getByText('final 2025/26: 7')).toBeTruthy();
    expect(screen.getByText('new subject')).toBeTruthy();
    // the teacher's final is a chip; the year until it is posted is a calculation in italics
    const algebra = screen.getByText('Алгебра').closest('button')!;
    expect(within(algebra).getByText('8').className).toContain('font-extrabold');
    expect(within(algebra).getByText('8.0').className).toContain('italic');
    const geometry = screen.getByText('Геометрия').closest('button')!;
    expect(within(geometry).getByText('6.4').className).toContain('italic');
    expect(within(geometry).getAllByText('–').length).toBe(2);
  });

  it('Years: a subject not taught this year, a new one, the arrow against last year', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/finals`} />);
    await screen.findByText('Алгебра');
    await userEvent.click(screen.getByRole('button', { name: 'Years' }));
    expect(await screen.findByText('not this year')).toBeTruthy();
    expect(screen.getByText('new subject')).toBeTruthy();
    expect(screen.getByText('2025/26')).toBeTruthy();
    expect(screen.getByText('better')).toBeTruthy();
  });

  it('Years: a past year typed in from the report card, marked "entered by hand", saved as a whole', async () => {
    const api = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at={`/s/${milena.id}/finals?mode=years`} />);
    expect(await screen.findByText(/The pen sign marks finals entered by hand/)).toBeTruthy();
    expect(screen.getAllByText('entered by hand').length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Enter last year’s finals' }));
    const sheet = await screen.findByRole('dialog', { name: 'Finals of a past year' });
    // the diary's own year is not offered, only as many years back as Years shows; the year typed in opens with its
    // values
    const years = within(sheet).getByRole('group', { name: 'School year' });
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
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
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
    expect(await screen.findByText('not this year')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enter last year’s finals' })).toBeNull();
  });
});
