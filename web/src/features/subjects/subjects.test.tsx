import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useMarkFilter, usePeriod, useSubjectSort } from '../../state/store';
import { fakeApi, KIDS, SUBJECT } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
  useSubjectSort.setState({ sort: 'alpha' });
});

const [milena, mark] = KIDS as [(typeof KIDS)[number], (typeof KIDS)[number]];

describe('Subjects', () => {
  it('every subject: last marks, the average with "was", a dash and words when there are none; the order sheet', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects`} />);
    const algebra = (await screen.findByText('Алгебра')).closest('button')!;
    expect(within(algebra).getByText('7.5')).toBeTruthy();
    expect(within(algebra).getByText('was 8.5')).toBeTruthy();
    const english = screen.getByText('Английский язык').closest('button')!;
    expect(within(english).getByText('adv.')).toBeTruthy();
    expect(within(english).getByText('—')).toBeTruthy();
    expect(within(english).getByText('no marks over the week')).toBeTruthy();
    expect(screen.getByText(/^The arrow compares/)).toBeTruthy();
    // the order is a sheet, never a native select
    await userEvent.click(screen.getByRole('button', { name: 'Order of subjects' }));
    const sheet = screen.getByRole('dialog', { name: 'Order of subjects' });
    expect(within(sheet).getAllByText('by the period’s average')).toHaveLength(2);
    await userEvent.click(within(sheet).getByRole('button', { name: /Weakest first/ }));
    await waitFor(() => expect(api.urls.some((u) => u.includes('/subjects?') && u.includes('sort=weak'))).toBe(true));
  });

  it('with Comments a row counts the teacher’s comments, never says there are no marks', async () => {
    useMarkFilter.setState({ comments: true });
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects`} />);
    expect(await screen.findByText('2 comments')).toBeTruthy();
    expect(screen.getByText('no comments')).toBeTruthy();
    expect(screen.queryByText('no marks over the week')).toBeNull();
  });

  it('a class without marks: lessons and homework, the next lesson, no filter and no order', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/subjects`} />);
    expect(await screen.findByText('5 lessons · 3 homework')).toBeTruthy();
    expect(screen.getByText(/^next: .*lesson 2 · с\. 14, № 3$/)).toBeTruthy();
    expect(screen.getByText(/^This class gets no marks/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Order of subjects' })).toBeNull();
    expect(screen.queryByText('Final marks')).toBeNull();
  });
});

describe('Subject', () => {
  it('settings line, "About the subject", the goal row and a hint, the marks, the coming lessons, the term strip', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    expect(await screen.findByRole('heading', { name: 'Алгебра' })).toBeTruthy();
    expect(screen.getByText('goal: final 8 · colour: blue')).toBeTruthy();
    expect(screen.getByText('Учитель Алгебры')).toBeTruthy();
    expect(screen.getByText(/^Mon lesson 2 · room 305$/)).toBeTruthy();
    // the goal: what is missing, best marks first
    expect(screen.getByText('Goal: final 8: 1 × 10 or 2 × 9 more')).toBeTruthy();
    expect(screen.getByText('heading for 7 now, the quarter’s average 7.1, needs 7.5')).toBeTruthy();
    // a low mark without a work type: no empty slot before the date
    expect(screen.getByText('Mark 3, Tue, 13 Oct')).toBeTruthy();
    expect(screen.getByText('Go through the work marked 3')).toBeTruthy();
    expect(screen.getByText('Квадратные уравнения', { exact: false })).toBeTruthy();
    expect(screen.getByText('Next lessons')).toBeTruthy();
    // Marksy has last year and the subject was not in it
    expect(screen.getByText('a new subject this year')).toBeTruthy();
    expect(screen.getByText('7.1').className).toContain('italic');
  });

  it('switching the child opens their subject of the same name, else their subjects', async () => {
    fakeApi({ signedIn: true });
    render(<App at={`/s/${mark.id}/subjects/sub-ma`} />);
    await screen.findByRole('heading', { name: 'Алгебра' });
    // the older child has a subject of the same name: her own subject opens
    await userEvent.click(screen.getByRole('tab', { name: milena.name }));
    await waitFor(() => expect(screen.getByText('goal: final 8 · colour: blue')).toBeTruthy());
    // the settings line was on screen before the switch too: wait for the tab itself
    expect(await screen.findByRole('tab', { name: milena.name, selected: true })).toBeTruthy();
    // the younger child has none: his list opens
    await userEvent.click(screen.getByRole('tab', { name: mark.name }));
    expect(await screen.findByText('5 lessons · 3 homework')).toBeTruthy();
  });

  it('guidance off: no "Worth a look" (subject.attention), the goal still shown in the settings', async () => {
    fakeApi({ signedIn: true, subject: { ...SUBJECT, attention: { goal: null, hints: [] } } });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    expect(await screen.findByText('goal: final 8 · colour: blue')).toBeTruthy();
    expect(screen.queryByText('Worth a look')).toBeNull();
  });

  it('the settings sheet: a goal from the scale, "No goal", a colour or "Auto", saved at once', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    await userEvent.click(await screen.findByRole('button', { name: /Subject settings/ }));
    const sheet = screen.getByRole('dialog', { name: 'Алгебра: settings' });
    // every whole value of the scale, 1 to 10 on by-10
    expect(within(sheet).getAllByRole('button', { pressed: false }).length).toBeGreaterThan(9);
    expect(within(sheet).getByRole('button', { name: '8', pressed: true })).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: '9' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/goal']).toEqual({ termGoal: 9 }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'No goal' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/goal']).toEqual({ termGoal: null }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Red' }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/color']).toEqual({ color: 'red' }),
    );
    await userEvent.click(within(sheet).getByRole('button', { name: /Auto/ }));
    await waitFor(() =>
      expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/color']).toEqual({ color: null }),
    );
  });
});
