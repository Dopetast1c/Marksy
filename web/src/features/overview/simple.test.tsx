import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice, useMarkFilter, usePeriod } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';
import { FIXTURE_NOW } from '../../test/setup';

beforeAll(() => {
  initI18n('ru');
});

const [milena] = KIDS as [(typeof KIDS)[number]];

beforeEach(() => {
  useDevice.setState({ pick: { id: milena.id, lastActive: FIXTURE_NOW.getTime() }, alwaysLast: false });
  usePeriod.setState({ kind: 'week', offset: 0 });
});

describe('Простой режим', () => {
  it('a student switches it in Ещё; a parent has no such row there', async () => {
    const api = fakeApi({ signedIn: true, role: 'student' });
    const user = userEvent.setup();
    const { unmount } = render(<App at="/more" />);
    await user.click(await screen.findByRole('switch', { name: 'Простой режим' }));
    expect(api.bodies['PATCH /api/me']).toEqual({ uiMode: 'simple' });
    unmount();
    fakeApi({ signedIn: true });
    render(<App at="/more" />);
    expect(await screen.findByText('Оформление')).toBeTruthy();
    expect(screen.queryByText('Простой режим')).toBeNull();
  });

  it('a parent switches it on the child’s screen, for the child’s own login', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at={`/more/family/child/${milena.id}`} />);
    await userEvent.setup().click(await screen.findByRole('switch', { name: 'Простой режим' }));
    expect(api.bodies['PUT /api/family/members/u3/ui-mode']).toEqual({ uiMode: 'simple' });
    expect(await screen.findByRole('switch', { name: 'Простой режим', checked: true })).toBeTruthy();
  });

  it('Главная: today’s marks large, the next day with a big «Готово» each; no period control, no statistics', async () => {
    const api = fakeApi({ signedIn: true, role: 'student', uiMode: 'simple' });
    render(<App at={`/s/${milena.id}`} />);
    expect(await screen.findByText('Сегодня')).toBeTruthy();
    expect(screen.queryByText('Статистика')).toBeNull();
    expect(screen.queryByRole('group', { name: /Период/ })).toBeNull();
    const ready = screen.getAllByRole('button', { name: 'Готово', pressed: false });
    expect(ready.length).toBeGreaterThan(0);
    await userEvent.setup().click(ready[0]!);
    expect(api.calls.some((c) => /^PUT \/api\/students\/kid-milena\/lessons\/[^/]+\/prep$/.test(c))).toBe(true);
    // the ⋯ menu stays
    expect(screen.getAllByRole('button', { name: 'Действия с уроком' }).length).toBe(ready.length);
  });

  it('Расписание: the large «Готово», and no statistics or advice under the lessons', async () => {
    fakeApi({ signedIn: true, role: 'student', uiMode: 'simple' });
    render(<App at={`/s/${milena.id}/schedule?day=2026-10-22`} />);
    expect((await screen.findAllByRole('button', { name: 'Готово' })).length).toBeGreaterThan(0);
    expect(screen.queryByText('Средняя оценка:')).toBeNull();
  });

  it('Оценки without the filter row; the stored choice filters nothing', async () => {
    useMarkFilter.setState({ comments: true });
    const api = fakeApi({ signedIn: true, role: 'student', uiMode: 'simple' });
    render(<App at={`/s/${milena.id}/marks`} />);
    expect(await screen.findByRole('heading', { name: 'Оценки' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Комментарии' })).toBeNull();
    expect(api.urls.find((u) => u.startsWith('GET /api/students/kid-milena/marks'))).toContain('comments=all');
    useMarkFilter.setState({ comments: false });
  });

  it('a parent looking at the same child sees the full app', async () => {
    fakeApi({ signedIn: true, uiMode: 'simple' });
    render(<App at={`/s/${milena.id}`} />);
    expect(await screen.findByText('Статистика')).toBeTruthy();
    expect(within(document.body).queryByRole('button', { name: 'Готово' })).toBeNull();
  });
});
