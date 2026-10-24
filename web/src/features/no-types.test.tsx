import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { initI18n } from '../i18n';
import { useMarkFilter, usePeriod } from '../state/store';
import { fakeApi, KIDS } from '../test/fake-api';

// Work and lesson types are almost never set in real data (api-spec 7.3, build-plan M5b): with every type null, no
// screen may show an empty slot, a placeholder for a missing type or a dangling separator.

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
});

const [milena] = KIDS as [(typeof KIDS)[number]];

/** Every leaf text of the page: none starts or ends with «·», none has two in a row, none is a type placeholder */
function expectNoDangling(root: HTMLElement) {
  const leaves = [...root.querySelectorAll('span, b, p, div')].filter((el) => el.children.length === 0);
  for (const el of leaves) {
    const text = el.textContent ?? '';
    // a part that joins the text before or after it («3 урока» + « · ко 2-му») needs that neighbour
    if (/^\s*·/.test(text)) expect(el.previousSibling?.textContent?.trim(), text).toBeTruthy();
    if (/·\s*$/.test(text)) expect(el.nextSibling?.textContent?.trim(), text).toBeTruthy();
    expect(text, text).not.toMatch(/·\s*·/);
    expect(text, text).not.toMatch(/Работа на уроке|undefined|null/);
  }
}

describe('a diary without types', () => {
  it.each([
    ['Главная', ''],
    ['Оценки', '/marks'],
    ['Предметы', '/subjects'],
    ['Предмет', '/subjects/sub-al'],
    ['Расписание', '/schedule?day=2026-10-22'],
  ])('%s has no empty slot or dangling separator', async (_name, path) => {
    fakeApi({ signedIn: true, noTypes: true });
    const { container } = render(<App at={`/s/${milena.id}${path}`} />);
    await screen.findAllByText('Алгебра', { exact: false });
    expectNoDangling(container);
    // no work type label anywhere
    expect(screen.queryByText(/Контрольная работа|Самостоятельная работа|Лабораторная работа/)).toBeNull();
  });
});
