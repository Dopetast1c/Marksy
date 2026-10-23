import { getProvider } from '@marksy/registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount } from '../../test/factories';
import { holidays, terms } from '../db/schema';
import { storeCalendar, storeStudents } from './store-school';

const db = testDb();

describe('storeCalendar', () => {
  beforeEach(() => resetDb(db));

  it('keeps the remarks on terms and holidays as notes', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const {
      listed: [student],
    } = await storeStudents(db, account, {
      externalUserId: 'U-1',
      displayName: null,
      role: 'parent',
      students: [{ externalId: 'p-1', fullName: 'Пример Ученик', grade: 1 }],
    });
    await storeCalendar(db, getProvider('demo-full')!.manifest, student!, {
      schoolYear: { externalId: 'y', label: '2026-2027', start: '2026-09-01', end: '2027-05-31' },
      terms: [
        {
          externalId: 'q4',
          kind: 'quarter',
          index: 4,
          label: 'FOURTH_QUARTER',
          start: '2027-03-29',
          end: '2027-05-31',
          note: 'для выпускных классов раньше',
        },
      ],
      holidays: [
        { from: '2027-02-15', to: '2027-02-21', note: 'для 1-2 классов' },
        { from: '2027-03-21', to: '2027-03-28' },
      ],
    });
    expect((await db.select().from(terms))[0]!.note).toBe('для выпускных классов раньше');
    const rows = await db.select().from(holidays).orderBy(holidays.startDate);
    expect(rows.map((h) => h.note)).toEqual(['для 1-2 классов', null]);
  });
});
