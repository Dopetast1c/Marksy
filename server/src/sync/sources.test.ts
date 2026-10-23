import { DEMO_FULL_FIXTURES, demoFullTransport, getProvider } from '@marksy/registry';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS, TEST_CREDENTIALS_KEY } from '../../test/factories';
import { familySees } from '../access';
import {
  diaryAccounts,
  familyStudents,
  memberships,
  notifications,
  studentSources,
  students,
  syncCoverage,
  syncRuns,
  users,
} from '../db/schema';
import { runCollector } from './collector';
import { readSyncConfig } from './config';
import { runSync } from './run';
import { followKey, rebalanceAccount } from './sources';

// Two households following one child (ux-principles D54): family A connected first; family B's login shows the same
// pupils of the fictional demo diary, first only p-2, later p-1 as well.

const db = testDb();
const NOW = new Date('2025-09-16T07:00:00Z'); // Tuesday, 10:00 in the demo's time zone
const profile = DEMO_FULL_FIXTURES.profile as { pupils: { pupil_id: string }[] };
const listing = (ids: string[]) => ({
  profile: { ...profile, pupils: profile.pupils.filter((p) => ids.includes(p.pupil_id)) },
});

async function household(login: string) {
  const { family, account } = await createAccount(db, 'demo-full');
  const [admin] = await db.insert(users).values({ login, displayName: 'Admin', passwordHash: 'x' }).returning();
  await db.insert(memberships).values({ userId: admin!.id, familyId: family.id, role: 'admin' });
  return { family, account, admin: admin! };
}

async function collect(account: { id: string; familyId: string; providerId: string }, pupils: string[]) {
  const [run] = await db
    .insert(syncRuns)
    .values({
      familyId: account.familyId,
      diaryAccountId: account.id,
      providerId: 'demo-full',
      kind: 'manual',
      trigger: 'cli',
      startedAt: NOW,
      status: 'running',
    })
    .returning();
  return runCollector({
    db,
    provider: getProvider('demo-full')!,
    account,
    credentials: DEMO_CREDENTIALS,
    runId: run!.id,
    plan: () => [{ weekStart: '2025-09-15', set: 'standing' }],
    transport: demoFullTransport({ fixtures: listing(pupils) }),
    sleep: async () => undefined,
    now: () => NOW,
  });
}

const studentId = async (externalId: string) =>
  (await db.select().from(students).where(eq(students.externalId, externalId)))[0]!.id;
const inbox = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

describe('a child followed by two families', () => {
  beforeEach(() => resetDb(db));

  it('a child appearing later in the second family is followed from it; the first family is told once, without names', async () => {
    const a = await household('a@example.com');
    const b = await household('b@example.com');
    await collect(a.account, ['p-1', 'p-2']);

    const first = await collect(b.account, ['p-2']);
    expect(first.students).toEqual([]); // read through family A's login, not twice
    expect(await familySees(db, b.family.id, await studentId('p-2'))).toBe(true);
    expect(await familySees(db, b.family.id, await studentId('p-1'))).toBe(false);

    // p-1 appears in family B's diary login later: followed from family B, no join offered, no approval asked
    await collect(b.account, ['p-1', 'p-2']);
    expect(await familySees(db, b.family.id, await studentId('p-1'))).toBe(true);
    expect(await db.select().from(students)).toHaveLength(2);

    const notes = await inbox(a.admin.id);
    expect(notes.map((n) => n.eventKey).sort()).toEqual(
      [followKey(await studentId('p-1'), b.family.id), followKey(await studentId('p-2'), b.family.id)].sort(),
    );
    expect(notes.every((n) => n.title === 'notification.childFollowed.title')).toBe(true);
    // the notice names the child of family A, never anyone of family B
    expect(JSON.stringify(notes)).not.toMatch(/b@example\.com|Admin/);
    expect(await inbox(b.admin.id)).toEqual([]);

    // the next runs change nothing
    await collect(b.account, ['p-1', 'p-2']);
    expect(await inbox(a.admin.id)).toHaveLength(2);
  });

  it("a login that stops showing a child: that family no longer sees it, the other family's login takes over", async () => {
    const a = await household('a@example.com');
    const b = await household('b@example.com');
    await collect(a.account, ['p-1', 'p-2']);
    await collect(b.account, ['p-1', 'p-2']);
    const p1 = await studentId('p-1');

    await collect(a.account, ['p-2']);
    expect(await familySees(db, a.family.id, p1)).toBe(false);
    const [link] = await db
      .select()
      .from(familyStudents)
      .where(and(eq(familyStudents.familyId, a.family.id), eq(familyStudents.studentId, p1)));
    expect(link!.status).toBe('suspended');
    const active = await db
      .select()
      .from(studentSources)
      .where(and(eq(studentSources.studentId, p1), eq(studentSources.active, true)));
    expect(active.map((s) => s.diaryAccountId)).toEqual([b.account.id]);

    // shown again: seen again
    await collect(a.account, ['p-1', 'p-2']);
    expect(await familySees(db, a.family.id, p1)).toBe(true);
  });

  it('a paused account hands its children to the other source', async () => {
    const a = await household('a@example.com');
    const b = await household('b@example.com');
    await collect(a.account, ['p-1', 'p-2']);
    await collect(b.account, ['p-1', 'p-2']);
    await db
      .update(diaryAccounts)
      .set({ pausedUntil: new Date(NOW.getTime() + 86_400_000) })
      .where(eq(diaryAccounts.id, a.account.id));
    await rebalanceAccount(db, a.account.id, NOW);
    const active = await db.select().from(studentSources).where(eq(studentSources.active, true));
    expect(active.map((s) => s.diaryAccountId)).toEqual([b.account.id, b.account.id]);
  });

  it("the account that reads no child only checks its list, once a school day, in a child's window", async () => {
    const a = await household('a@example.com');
    const b = await household('b@example.com');
    const opts = (local: string) => ({
      db,
      config: readSyncConfig({}),
      now: () => new Date(`${local}:00+03:00`),
      transport: demoFullTransport(),
      sleep: async () => undefined,
      online: async () => true,
      credentialsKey: TEST_CREDENTIALS_KEY,
      trigger: 'schedule' as const,
    });
    await runSync({ ...opts('2025-09-16T08:00'), accountId: a.account.id });
    await runSync({ ...opts('2025-09-16T08:05'), accountId: b.account.id }); // B's first login: lists the children
    const coverage = (await db.select().from(syncCoverage)).length;

    // Thursday 18 Sep, in p-1's school day: a login and the account call, nothing else
    const check = await runSync({ ...opts('2025-09-18T09:00'), accountId: b.account.id });
    expect(check).toMatchObject({ outcome: 'ran', status: 'success', requests: 2 });
    const [run] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.diaryAccountId, b.account.id))
      .orderBy(syncRuns.startedAt)
      .offset(1);
    expect(run!.kind).toBe('source_check');
    expect((await db.select().from(syncCoverage)).length).toBe(coverage);
    // once a school day: later the same Thursday, inside the window (07:30-10:45) and the login interval, nothing
    expect(await runSync({ ...opts('2025-09-18T10:15'), accountId: b.account.id })).toMatchObject({
      outcome: 'skipped',
      decision: { reason: 'checked_today' },
    });
  });
});
