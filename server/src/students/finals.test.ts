import { describe, expect, it } from 'vitest';
import type { ChildContext, TermRow } from './context';
import { finalsState } from './finals';
import type { FinalRow } from './finals';

const term = (index: number, startDate: string, endDate: string) =>
  ({ id: `t${index}`, kind: 'quarter', index, label: `${index}`, startDate, endDate }) as TermRow;
const TERMS = [term(1, '2026-09-01', '2026-10-31'), term(2, '2026-11-09', '2026-12-24')];

const ctx = (today: string, caps: Partial<ChildContext['caps']> = {}) =>
  ({
    today,
    timezone: 'Europe/Minsk',
    termRows: TERMS,
    caps: { terms: 'quarter', finalMarks: true, ...caps },
  }) as unknown as ChildContext;

const final = (periodId: string, date: string | null, firstSeenAt: Date | null) =>
  ({ periodId, date, firstSeenAt, source: 'api', updatedAt: new Date('2026-11-04T09:00:00Z') }) as FinalRow;

describe('the finals entry row', () => {
  it('names the running term, the ended one, and the posted one with its day', () => {
    expect(finalsState(ctx('2026-10-15'), [])).toMatchObject({ state: 'running', term: { index: 1 } });
    expect(finalsState(ctx('2026-11-03'), [])).toMatchObject({ state: 'ended', term: { index: 1 } });
    // the diary's own date wins; else the day Marksy first saw it, in the school's time zone
    expect(finalsState(ctx('2026-11-03'), [final('t1', '2026-10-30', null)])).toMatchObject({
      state: 'posted',
      postedOn: '2026-10-30',
    });
    expect(finalsState(ctx('2026-10-31'), [final('t1', null, new Date('2026-10-30T22:30:00Z'))])).toMatchObject({
      state: 'posted',
      term: { index: 1 },
      postedOn: '2026-10-31',
    });
    // once the next term starts the finals are no longer news
    expect(finalsState(ctx('2026-11-10'), [final('t1', '2026-10-30', null)])).toMatchObject({
      state: 'running',
      term: { index: 2 },
    });
  });

  it('is absent without terms, without final marks, or before the first term', () => {
    expect(finalsState(ctx('2026-10-15', { terms: 'none' }), [])).toBeNull();
    expect(finalsState(ctx('2026-10-15', { finalMarks: false }), [])).toBeNull();
    expect(finalsState(ctx('2026-08-20'), [])).toBeNull();
  });
});
