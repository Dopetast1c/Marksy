import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount } from '../../test/factories';
import { providerMemo, students } from '../db/schema';
import { memoStore } from './memo';
import { dropUnlisted } from './sources';
import { upsertListedStudent } from './store-school';

const db = testDb();
const NOW = new Date('2025-09-19T09:00:00Z');

describe('provider_memo (ctx.memo)', () => {
  beforeEach(() => resetDb(db));

  it("a child's own value goes when the account no longer lists the child, and with the child", async () => {
    const { account } = await createAccount(db, 'demo-full');
    const listed = { externalId: 'p-1', fullName: 'Pupil One' };
    const other = { externalId: 'p-2', fullName: 'Pupil Two' };
    const one = await upsertListedStudent(db, account, listed, NOW);
    const two = await upsertListedStudent(db, account, other, NOW);
    const store = memoStore(db, account, new Set(), () => NOW);
    await store.save('calendar', 'weeks', [{ id: 'w-1' }]);
    await store.save('calendar', 'classes:p-1', [{ id: 'c-1' }], 'p-1');
    await store.save('school', 'subjects:p-2', [{ id: 's-1' }], 'p-2');
    // a child not stored yet: nothing is kept for them
    await store.save('school', 'subjects:p-9', [{ id: 's-9' }], 'p-9');
    const keys = async () => (await db.select().from(providerMemo)).map((r) => r.key).sort();
    expect(await keys()).toEqual(['classes:p-1', 'subjects:p-2', 'weeks']);
    expect(await store.load('classes:p-1')).toEqual({ kind: 'calendar', value: [{ id: 'c-1' }] });

    // the login no longer lists p-1
    await dropUnlisted(db, account, [two.id]);
    expect(await keys()).toEqual(['subjects:p-2', 'weeks']);
    // p-2's data deleted (Delete the data): its own value goes with it
    await db.delete(students).where(eq(students.id, two.id));
    expect(await keys()).toEqual(['weeks']);
    expect(one.id).not.toBe(two.id);
  });
});
