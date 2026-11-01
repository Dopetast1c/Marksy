import { describe, expect, it } from 'vitest';
import { dailyDue } from './daemon';
import { keepDaily, keepNewest } from './rotation';

const day = (iso: string, name = iso) => ({ name, at: new Date(iso) });

describe('backup rotation', () => {
  it('7 daily, 4 weekly, 6 monthly: a year of daily backups keeps at most 17, the newest always', () => {
    const files = Array.from({ length: 365 }, (_, i) => day(new Date(Date.UTC(2026, 0, 1 + i, 3, 30)).toISOString()));
    const kept = keepDaily(files);
    expect(kept.size).toBeLessThanOrEqual(17);
    expect(kept.has(files.at(-1)!.name)).toBe(true);
    // the last seven days are all there
    for (const f of files.slice(-7)) expect(kept.has(f.name)).toBe(true);
    // six months back, one per month
    const months = new Set([...kept].map((n) => n.slice(0, 7)));
    expect(months.size).toBe(6);
  });

  it('two backups on one day: the newer stays', () => {
    const kept = keepDaily([day('2026-10-28T03:30:00Z', 'early'), day('2026-10-28T21:00:00Z', 'late')]);
    expect([...kept]).toEqual(['late']);
  });

  it('backups before updates: the newest ten, however many in a day', () => {
    const files = Array.from({ length: 14 }, (_, i) => day(`2026-10-28T${String(8 + i).padStart(2, '0')}:00:00Z`));
    const kept = keepNewest(files);
    expect(kept.size).toBe(10);
    expect(kept.has(files[0]!.name)).toBe(false);
    expect(kept.has(files[13]!.name)).toBe(true);
  });

  it('the daily backup is due after its time when none was taken since; a host off at that time catches up', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m);
    const yesterdayAfterSlot = new Date(at(3, 31).getTime() - 86_400_000);
    // before today's time, yesterday's backup is the current one
    expect(dailyDue(at(3, 0), '03:30', yesterdayAfterSlot)).toBe(false);
    expect(dailyDue(at(3, 31), '03:30', yesterdayAfterSlot)).toBe(true);
    expect(dailyDue(at(9), '03:30', at(3, 35))).toBe(false);
    // off since the day before yesterday: due at once, whatever the hour
    expect(dailyDue(at(1), '03:30', new Date(at(1).getTime() - 2 * 86_400_000))).toBe(true);
    expect(dailyDue(at(1), '03:30', null)).toBe(true);
  });
});
