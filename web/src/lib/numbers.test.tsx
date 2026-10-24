import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { initI18n, setLanguage } from '../i18n';
import { useMarkFilter, usePeriod } from '../state/store';
import { fakeApi, KIDS } from '../test/fake-api';

// One formatter for every number of the scale (lib/numbers.ts): the same average is written the same way on every
// screen, with the interface language's separator (ru «7,5», en «7.5») and the scale's decimals.

const [milena] = KIDS as [(typeof KIDS)[number]];

beforeEach(() => {
  usePeriod.setState({ kind: 'week', offset: 0 });
  useMarkFilter.setState({ comments: false, tags: [], tagMode: 'any' });
});
afterAll(() => {
  void setLanguage('ru');
});

const CASES = [
  {
    lang: 'ru',
    avg: '7,4',
    was: 'было 8,2',
    subj: '7,5',
    subjWas: 'было 8,5',
    need: 'нужен 7,5',
    live: '6,4',
    ev: '6,0',
  },
  {
    lang: 'en',
    avg: '7.4',
    was: 'was 8.2',
    subj: '7.5',
    subjWas: 'was 8.5',
    need: 'needs 7.5',
    live: '6.4',
    ev: '6.0',
  },
] as const;

describe.each(CASES)('numbers in $lang', (c) => {
  it('Главная, Внимание, Предметы, Предмет and Итоги write the same numbers the same way', async () => {
    initI18n(c.lang);
    fakeApi({ signedIn: true, locale: c.lang });
    const home = render(<App at={`/s/${milena.id}`} />);
    expect((await screen.findAllByText(c.avg)).length).toBeGreaterThan(0);
    expect(screen.getByText(c.was)).toBeTruthy();
    home.unmount();

    const events = render(<App at={`/s/${milena.id}/events`} />);
    expect((await screen.findAllByText((text) => text.includes(c.ev))).length).toBeGreaterThan(0);
    events.unmount();

    const subjects = render(<App at={`/s/${milena.id}/subjects`} />);
    const algebra = (await screen.findAllByText(/^(Алгебра)$/))[0]!.closest('button')!;
    expect(within(algebra).getByText(c.subj)).toBeTruthy();
    expect(within(algebra).getByText(c.subjWas)).toBeTruthy();
    subjects.unmount();

    const subject = render(<App at={`/s/${milena.id}/subjects/sub-al`} />);
    expect((await screen.findAllByText(c.subj)).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(c.need.replace('.', '\\.')))).toBeTruthy();
    subject.unmount();

    render(<App at={`/s/${milena.id}/finals`} />);
    expect(await screen.findByText(c.live)).toBeTruthy();
  });
});
