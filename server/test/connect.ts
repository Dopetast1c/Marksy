import { CONSENT_VERSION } from '@marksy/i18n';
import { DEMO_FULL_FIXTURES, demoFullTransport } from '@marksy/registry';
import type { Transport } from '@marksy/core';
import request from 'supertest';
import { testApp } from './app';
import type { AppDeps } from '../src/http/context';
import { DEMO_PARENT_NAME } from '../src/seed/seed';

export type TestAgent = ReturnType<typeof request.agent>;

// Connecting fictional diaries through the API, as a person in a browser would (one agent keeps the cookie).

/** The consent text the app shows: the only version the API accepts */
export const CONSENT = CONSENT_VERSION;

export function agentWith(over: Partial<AppDeps> = {}): TestAgent {
  return request.agent(testApp(over));
}

/** A second demo-full login (another parent): its own user id, showing only the children listed */
export function otherParentTransport(pupils: string[], userId = 'U-2'): Transport {
  const profile = structuredClone(DEMO_FULL_FIXTURES.profile) as { user_id: string; pupils: { pupil_id: string }[] };
  profile.user_id = userId;
  profile.pupils = profile.pupils.filter((p) => pupils.includes(p.pupil_id));
  return demoFullTransport({ fixtures: { profile } });
}

export async function connectFamily(agent: TestAgent, login = 'parent@example.com', providerId = 'demo-full') {
  const res = await agent.post('/api/auth/connect').send({
    providerId,
    credentials: { login: 'diary-user', password: 'diary-pw-123' },
    role: 'parent',
    user: { login, password: 'correct horse battery', displayName: DEMO_PARENT_NAME },
    consentVersion: CONSENT,
  });
  if (res.status !== 201) throw new Error(`connect failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as {
    family: { id: string };
    students: { id: string; name: string }[];
    connect: { accountId: string; matches: { studentId: string }[] };
  };
}
