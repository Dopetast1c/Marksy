import { CADENCE_PRESETS } from '@marksy/core';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle } from '../../test/app';
import { agentWith, CONSENT, connectFamily, otherParentTransport } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { familyStudents, students } from '../db/schema';

// Family → the child → "Reading the diary" (family.sync.title; docs/design.md 10.2, ux-principles D63)

const db = testDb();

describe('a child’s sync mode', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('follows the year by default and offers only what the provider serves, with the estimate’s inputs', async () => {
    const agent = agentWith();
    const { students: kids } = await connectFamily(agent);
    await settle();
    const child = kids[0]!;
    const [row] = await db.select({ scale: students.gradingScaleId }).from(students).where(eq(students.id, child.id));
    const res = await agent.get(`/api/family/students/${child.id}/sync`);
    expect(res.status).toBe(200);
    const year = row?.scale ? 'marks' : 'noMarks';
    expect(res.body).toMatchObject({
      mode: null,
      defaultMode: year,
      settings: CADENCE_PRESETS[year],
      effective: CADENCE_PRESETS[year],
    });
    // demo-full shows lessons ahead and has finals: every setting is offered
    expect(res.body.offered).toEqual([
      'day',
      'previousWeek',
      'nextWeek',
      'termRecheck',
      'finals',
      'school',
      'calendar',
    ]);
    expect(res.body.estimate).toMatchObject({ intervalMinutes: 60, weekRequests: 1, readsAhead: true });
    expect(res.body.estimate.windowMinutes).toBeGreaterThan(0);
    expect(res.body.estimate.termWeeks).toBeGreaterThan(0);
  });

  it('a preset, custom settings and back to the year’s default; nothing unknown is stored', async () => {
    const agent = agentWith();
    const { students: kids } = await connectFamily(agent);
    const child = kids[0]!;
    const url = `/api/family/students/${child.id}/sync`;

    const light = await agent.put(url).send({ mode: 'light' });
    expect(light.status).toBe(200);
    expect(light.body).toMatchObject({ mode: 'light', settings: CADENCE_PRESETS.light });

    const custom = await agent.put(url).send({ mode: 'custom', custom: { ...CADENCE_PRESETS.light, day: 'thrice' } });
    expect(custom.body.mode).toBe('custom');
    expect(custom.body.settings).toEqual({ ...CADENCE_PRESETS.light, day: 'thrice' });
    expect(custom.body.effective.day).toBe('thrice');

    expect((await agent.put(url).send({ mode: 'custom', custom: { day: 'never' } })).status).toBe(400);
    expect((await agent.put(url).send({ mode: 'turbo' })).status).toBe(400);

    const back = await agent.put(url).send({ mode: null });
    expect(back.body.mode).toBeNull();
    const [link] = await db
      .select({ settings: familyStudents.settings })
      .from(familyStudents)
      .where(eq(familyStudents.studentId, child.id));
    expect(link?.settings.sync).toBeUndefined();
  });

  it('a child two families follow is read with the more frequent choice; each family sees its own', async () => {
    const mama = agentWith();
    await connectFamily(mama);
    const papa = agentWith({ transportFor: () => otherParentTransport(['p-1']) });
    const res = await papa.post('/api/auth/connect').send({
      providerId: 'demo-full',
      credentials: { login: 'other-diary-user', password: 'other-pw-123' },
      role: 'parent',
      user: { login: 'papa@example.com', password: 'correct horse battery', displayName: 'Папа' },
      consentVersion: CONSENT,
    });
    const shared = (res.body as { connect: { matches: { studentId: string }[] } }).connect.matches[0]!.studentId;
    expect(
      (
        await papa
          .post(`/api/family/accounts/${res.body.connect.accountId}/matches/${shared}`)
          .send({ action: 'follow' })
      ).status,
    ).toBe(200);

    await mama.put(`/api/family/students/${shared}/sync`).send({ mode: 'custom', custom: { day: 'afterSchool' } });
    await papa.put(`/api/family/students/${shared}/sync`).send({ mode: 'custom', custom: { day: 'every2h' } });
    const mine = (await mama.get(`/api/family/students/${shared}/sync`)).body;
    expect(mine.settings.day).toBe('afterSchool');
    expect(mine.effective.day).toBe('every2h');
  });

  it('only a child of the family, only for adults', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await agent.get(`/api/family/students/${stranger}/sync`)).status).toBe(404);
    expect((await agent.put(`/api/family/students/${stranger}/sync`).send({ mode: 'light' })).status).toBe(404);
    expect((await agentWith().get(`/api/family/students/${stranger}/sync`)).status).toBe(401);
  });
});
