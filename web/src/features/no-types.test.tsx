import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { initI18n } from '../i18n';
import { useMarkFilter, usePeriod } from '../state/store';
import { fakeApi, KIDS } from '../test/fake-api';

// Work and lesson types are almost never set in real data (api-spec 7.3, build-plan M5b): with every type null, no
// screen may show an empty slot, a placeholder for a missing type or a dangling separator.

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
});

const [milena] = KIDS as [(typeof KIDS)[number]];

/** Every leaf text of the page: none starts or ends with "·", none has two in a row, none is a type placeholder */
function expectNoDangling(root: HTMLElement) {
  const leaves = [...root.querySelectorAll('span, b, p, div')].filter((el) => el.children.length === 0);
  for (const el of leaves) {
    const text = el.textContent ?? '';
    // a part that joins the text before or after it ("3 lessons" + " · from lesson 2") needs that neighbour
    if (/^\s*·/.test(text)) expect(el.previousSibling?.textContent?.trim(), text).toBeTruthy();
    if (/·\s*$/.test(text)) expect(el.nextSibling?.textContent?.trim(), text).toBeTruthy();
    expect(text, text).not.toMatch(/·\s*·/);
    // "Work in class" (workType.none) and "Classwork" (workType.classwork): placeholders for a missing type
    expect(text, text).not.toMatch(/Work in class|Classwork|undefined|null/);
  }
}

describe('a diary without types', () => {
  it.each([
    ['Home', ''],
    ['Marks', '/marks'],
    ['Subjects', '/subjects'],
    ['Subject', '/subjects/sub-al'],
    ['Timetable', '/schedule?day=2026-10-22'],
  ])('%s has no empty slot or dangling separator', async (_name, path) => {
    fakeApi({ signedIn: true, noTypes: true });
    const { container } = render(<App at={`/s/${milena.id}${path}`} />);
    await screen.findAllByText('Алгебра', { exact: false });
    expectNoDangling(container);
    // no work type label anywhere: "Test", "Quiz", "Lab work" (workType.*); the tip "Test. Subject average …"
    // (guidance.lessonTest.fact) comes from the lesson's tag, not from a type
    expect(screen.queryByText(/\bTest\b(?!\.)|Quiz|Lab work/)).toBeNull();
  });
});
