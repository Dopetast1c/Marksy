import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, CONSENT, connectFamily, otherParentTransport } from '../../test/connect';
import type { TestAgent } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import {
  alertRules,
  diaryAccounts,
  families,
  familyStudents,
  invites,
  joinRequests,
  notifications,
  students,
  studentSources,
  syncRuns,
  users,
} from '../db/schema';
import { storeStudents } from '../sync/store-school';

const db = testDb();

/** The second family: another parent's demo-full login that shows only p-1 (the shared child) */
async function secondFamily() {
  const agent = agentWith({ transportFor: () => otherParentTransport(['p-1']) });
  const res = await agent.post('/api/auth/connect').send({
    providerId: 'demo-full',
    credentials: { login: 'other-diary-user', password: 'other-pw-123' },
    role: 'parent',
    user: { login: 'papa@example.com', password: 'correct horse battery', displayName: 'Папа' },
    consentVersion: CONSENT,
  });
  expect(res.status).toBe(201);
  return {
    agent,
    body: res.body as { family: { id: string }; connect: { accountId: string; matches: { studentId: string }[] } },
  };
}

async function invite(agent: TestAgent, role: string, studentIds: string[] = []) {
  const res = await agent.post('/api/family/invites').send({ role, studentIds });
  expect(res.status).toBe(201);
  return res.body.code as string;
}

describe('family', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('Семья shows members, the diary login and the children; never credentials', async () => {
    const agent = agentWith();
    const first = await connectFamily(agent);
    const res = await agent.get('/api/family');
    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      expect.objectContaining({ displayName: 'Мама', role: 'admin', studentIds: expect.any(Array) }),
    ]);
    expect(res.body.accounts).toEqual([
      expect.objectContaining({
        providerId: 'demo-full',
        label: 'diary-user',
        status: 'ok',
        studentIds: expect.any(Array),
      }),
    ]);
    expect(res.body.children.map((c: { status: string }) => c.status)).toEqual(['active', 'active']);
    expect(res.body.children.every((c: { sharedWithOtherFamily: boolean }) => !c.sharedWithOtherFamily)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/diary-pw-123|credentials/);
    expect(first.connect.matches).toEqual([]);
  });

  it('a child another family follows waits for a choice; «Следить из своей семьи» links it and tells them once, without names', async () => {
    const mama = agentWith();
    await connectFamily(mama);
    const { agent: papa, body } = await secondFamily();
    expect(body.connect.matches).toHaveLength(1);
    // nothing of the child is served before the choice
    expect((await papa.get('/api/auth/me')).body.students).toEqual([]);
    const shared = body.connect.matches[0]!.studentId;
    const choice = await papa
      .post(`/api/family/accounts/${body.connect.accountId}/matches/${shared}`)
      .send({ action: 'follow' });
    expect(choice.body).toEqual({ outcome: 'followed' });
    expect((await papa.get('/api/auth/me')).body.students.map((s: { id: string }) => s.id)).toEqual([shared]);
    // one child, two links; the first family hears of it once and learns no name
    expect(await db.select().from(students).where(eq(students.externalId, 'p-1'))).toHaveLength(1);
    const notes = await db.select().from(notifications);
    expect(notes).toHaveLength(1);
    expect(JSON.stringify(notes)).not.toMatch(/Папа|papa@example\.com/);
    const mamaView = (await mama.get('/api/family')).body;
    expect(mamaView.children.find((c: { studentId: string }) => c.studentId === shared).sharedWithOtherFamily).toBe(
      true,
    );
    expect(JSON.stringify(mamaView)).not.toMatch(/Папа|papa@example\.com|other-diary-user/);
    // the second family's admin got the default rules about the child it follows now
    const [papaUser] = await db.select().from(users).where(eq(users.login, 'papa@example.com'));
    expect((await db.select().from(alertRules).where(eq(alertRules.userId, papaUser!.id))).length).toBeGreaterThan(0);
  });

  it('«Присоединиться» asks the other family; the admin approves and the login becomes theirs', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    const { agent: papa, body } = await secondFamily();
    const shared = body.connect.matches[0]!.studentId;
    const ask = () =>
      papa.post(`/api/family/accounts/${body.connect.accountId}/matches/${shared}`).send({ action: 'join' });
    expect((await ask()).body).toEqual({ outcome: 'requested' });
    // asking twice is asking once
    expect((await ask()).body).toEqual({ outcome: 'requested' });
    const pending = (await mama.get('/api/family')).body.joinRequests;
    expect(pending).toEqual([expect.objectContaining({ displayName: 'Папа' })]);
    expect((await mama.patch(`/api/family/join-requests/${pending[0].id}`).send({ approve: true })).status).toBe(204);
    const [account] = await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, body.connect.accountId));
    expect(account!.familyId).toBe(first.family.id);
    const after = (await mama.get('/api/family')).body;
    expect(after.members.map((m: { displayName: string }) => m.displayName).sort()).toEqual(['Мама', 'Папа']);
    expect((await db.select().from(joinRequests))[0]!.status).toBe('approved');
    // the login's sync log went with it
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.diaryAccountId, body.connect.accountId));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.familyId === first.family.id)).toBe(true);
  });

  it('only the admin hands a diary login to another family; an approval after the asker left moves nothing', async () => {
    const mama = agentWith();
    await connectFamily(mama);
    const { agent: papa, body } = await secondFamily();
    const shared = body.connect.matches[0]!.studentId;
    // a parent of Папа's family may not ask to join
    const code = await invite(papa, 'parent');
    const helper = agentWith();
    await helper
      .post(`/api/invites/${code}/accept`)
      .send({ login: 'helper@example.com', password: 'correct horse battery', displayName: 'Помощник' });
    const byParent = await helper
      .post(`/api/family/accounts/${body.connect.accountId}/matches/${shared}`)
      .send({ action: 'join' });
    expect(byParent.status).toBe(403);
    // the admin asks, hands the family to the helper and leaves: the request is stale
    await papa.post(`/api/family/accounts/${body.connect.accountId}/matches/${shared}`).send({ action: 'join' });
    const [helperUser] = await db.select().from(users).where(eq(users.login, 'helper@example.com'));
    const [papaUser] = await db.select().from(users).where(eq(users.login, 'papa@example.com'));
    expect((await papa.patch(`/api/family/members/${helperUser!.id}`).send({ role: 'admin' })).status).toBe(204);
    expect((await papa.delete(`/api/family/members/${papaUser!.id}`)).status).toBe(204);
    const pending = (await mama.get('/api/family')).body.joinRequests;
    const stale = await mama.patch(`/api/family/join-requests/${pending[0].id}`).send({ approve: true });
    expect(stale.body.error.code).toBe('request_stale');
    const [account] = await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, body.connect.accountId));
    expect(account!.familyId).toBe(body.family.id);
  });

  it('a student sees exactly one child: becoming a student needs that one child', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    const code = await invite(mama, 'parent');
    await agentWith()
      .post(`/api/invites/${code}/accept`)
      .send({ login: 'kid2@example.com', password: 'correct horse battery', displayName: 'Ребёнок' });
    const [kid] = await db.select().from(users).where(eq(users.login, 'kid2@example.com'));
    expect((await mama.patch(`/api/family/members/${kid!.id}`).send({ role: 'student' })).body.error.code).toBe(
      'student_needs_one_child',
    );
    const one = first.students[0]!.id;
    expect(
      (await mama.patch(`/api/family/members/${kid!.id}`).send({ role: 'student', studentIds: [one] })).status,
    ).toBe(204);
    const rules = await db.select().from(alertRules).where(eq(alertRules.userId, kid!.id));
    expect(new Set(rules.map((r) => r.studentId))).toEqual(new Set([one]));
    // the student defaults now: a new mark on, the comment off where it exists
    expect(rules.find((r) => r.presetKey === 'mark.any')?.enabled).toBe(true);
  });

  it('invite codes cannot be tried one after another', async () => {
    const app = testApp();
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await request(app).get(`/api/invites/WRONG${i}`)).status);
    expect(codes.slice(0, 5).every((c) => c === 410)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('«Перестать следить» while a login shows the child: stopped, not served, not re-linked; «Следить снова» brings the history back', async () => {
    const agent = agentWith();
    const first = await connectFamily(agent);
    const child = first.students[0]!.id;
    expect((await agent.delete(`/api/family/students/${child}`)).body).toEqual({ outcome: 'stopped' });
    expect((await agent.get('/api/auth/me')).body.students.map((s: { id: string }) => s.id)).not.toContain(child);
    const view = (await agent.get('/api/family')).body;
    expect(view.children.find((c: { studentId: string }) => c.studentId === child).status).toBe('stopped');
    // the next collector run lists the child again: the link stays stopped and the family is not read through
    const [account] = await db.select().from(diaryAccounts);
    await storeStudents(
      db,
      { id: account!.id, familyId: account!.familyId, providerId: 'demo-full' },
      {
        externalUserId: 'U-1',
        displayName: null,
        role: 'parent',
        students: [{ externalId: 'p-1', fullName: 'Пример Ученик А' }],
      },
    );
    const [link] = await db
      .select()
      .from(familyStudents)
      .where(and(eq(familyStudents.familyId, first.family.id), eq(familyStudents.studentId, child)));
    expect(link!.status).toBe('stopped');
    const [source] = await db.select().from(studentSources).where(eq(studentSources.studentId, child));
    expect(source!.active).toBe(false);
    expect((await agent.post(`/api/family/students/${child}/follow`)).status).toBe(204);
    expect((await agent.get('/api/auth/me')).body.students.map((s: { id: string }) => s.id)).toContain(child);
  });

  it('«Удалить данные» only for a stopped child no other family follows, after typing the name', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    const [lonely, shared] = [
      first.students.find((s) => s.name.includes('Б'))!,
      first.students.find((s) => s.name.includes('А'))!,
    ];
    await secondFamily().then(({ agent, body }) =>
      agent.post(`/api/family/accounts/${body.connect.accountId}/matches/${shared.id}`).send({ action: 'follow' }),
    );
    for (const s of [lonely, shared]) await mama.delete(`/api/family/students/${s.id}`);
    expect(
      (await mama.delete(`/api/family/students/${shared.id}/data`).send({ confirm: shared.name })).body.error.code,
    ).toBe('followed_elsewhere');
    expect((await mama.delete(`/api/family/students/${lonely.id}/data`).send({ confirm: 'нет' })).status).toBe(400);
    expect((await mama.delete(`/api/family/students/${lonely.id}/data`).send({ confirm: lonely.name })).status).toBe(
      204,
    );
    expect(await db.select().from(students).where(eq(students.id, lonely.id))).toEqual([]);
    expect(await db.select().from(students).where(eq(students.id, shared.id))).toHaveLength(1);
  });

  it('invites: a hashed single-use code; a new person or a signed-in one (a second family)', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    const code = await invite(mama, 'parent');
    expect(await db.select().from(invites).where(eq(invites.code, code))).toEqual([]);
    const app = testApp();
    const seen = await request(app).get(`/api/invites/${code}`);
    expect(seen.body).toMatchObject({ role: 'parent', students: expect.any(Array) });
    const babushka = request.agent(app);
    const joined = await babushka
      .post(`/api/invites/${code}/accept`)
      .send({ login: 'babushka@example.com', password: 'correct horse battery', displayName: 'Бабушка' });
    expect(joined.status).toBe(200);
    expect(joined.body.family.id).toBe(first.family.id);
    expect(joined.body.students).toHaveLength(2);
    expect((await request(app).get(`/api/invites/${code}`)).status).toBe(410);
    // the second family invites the same person: one login, two families
    const { agent: papa } = await secondFamily();
    const second = await invite(papa, 'parent');
    const again = await babushka.post(`/api/invites/${second}/accept`).send({});
    expect(again.body.memberships).toHaveLength(2);
    expect((await babushka.post('/api/auth/family').send({ familyId: first.family.id })).body.family.id).toBe(
      first.family.id,
    );
  });

  it('a student sees only themselves and cannot open Семья; the last admin cannot leave', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    const kid = first.students[0]!;
    const code = await invite(mama, 'student', [kid.id]);
    const student = agentWith();
    const me = (
      await student
        .post(`/api/invites/${code}/accept`)
        .send({ login: 'kid@example.com', password: 'correct horse battery', displayName: 'Ребёнок' })
    ).body;
    expect(me.students.map((s: { id: string }) => s.id)).toEqual([kid.id]);
    expect((await student.get('/api/family')).status).toBe(403);
    expect((await student.post('/api/family/invites').send({ role: 'parent' })).status).toBe(403);
    // student rules: about themselves only
    const [kidUser] = await db.select().from(users).where(eq(users.login, 'kid@example.com'));
    const rules = await db.select().from(alertRules).where(eq(alertRules.userId, kidUser!.id));
    expect(new Set(rules.map((r) => r.studentId))).toEqual(new Set([kid.id]));
    const [mamaUser] = await db.select().from(users).where(eq(users.login, 'parent@example.com'));
    expect((await mama.delete(`/api/family/members/${mamaUser!.id}`)).body.error.code).toBe('last_admin');
    expect((await student.delete(`/api/family/members/${kidUser!.id}`)).status).toBe(204);
  });

  it('export: the family and its children, no credentials, no other family; erase after typing the name', async () => {
    const mama = agentWith();
    const first = await connectFamily(mama);
    await secondFamily().then(({ agent, body }) =>
      agent
        .post(`/api/family/accounts/${body.connect.accountId}/matches/${first.students[0]!.id}`)
        .send({ action: 'follow' }),
    );
    const exported = await mama.get('/api/family/export');
    expect(exported.status).toBe(200);
    expect(exported.body.children).toHaveLength(2);
    expect(JSON.stringify(exported.body)).not.toMatch(/credentials|password|diary-pw-123|Папа|papa@example\.com/i);
    // only this family's notices; a suspended child is not exported
    expect(exported.body.notifications.every((n: { familyId: string }) => n.familyId === first.family.id)).toBe(true);
    await db
      .update(familyStudents)
      .set({ status: 'suspended' })
      .where(and(eq(familyStudents.familyId, first.family.id), eq(familyStudents.studentId, first.students[1]!.id)));
    expect((await mama.get('/api/family/export')).body.children).toHaveLength(1);
    expect((await mama.delete('/api/family').send({ confirm: 'wrong' })).status).toBe(400);
    expect((await mama.delete('/api/family').send({ confirm: 'Мама' })).status).toBe(204);
    expect((await db.select().from(families)).map((f) => f.id)).not.toContain(first.family.id);
    // the person in no family any more is gone; the child the other family follows stays
    expect(await db.select().from(users).where(eq(users.login, 'parent@example.com'))).toEqual([]);
    expect(await db.select().from(students)).toHaveLength(1);
  });
});
