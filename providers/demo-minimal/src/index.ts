import { ProviderAuthError, ProviderUnavailableError, providerManifest } from '@marksy/core';
import type { DiaryProvider, HttpResponse, ProviderContext, Session } from '@marksy/core';
import manifestJson from '../provider.json';
import { mapAccount, mapCalendar, mapGrades, mapSubjects } from './map';
import { coursesResponse, gradesResponse, meResponse, sessionResponse, yearResponse } from './schemas';

// demo-minimal: a fictional gradebook with the thinnest capability set (docs/providers.md 10): no lessons, marks by
// date only, no work types, comments, attendance, terms or finals, a 100-point scale and a week that starts on Sunday.
// It has no real system behind it; its "API" is the fixtures, served through ctx.http like any other provider.

export const manifest = providerManifest.parse(manifestJson);

function check(res: HttpResponse): unknown {
  if (res.status === 401 || res.status === 403) throw new ProviderAuthError('Login rejected');
  if (res.status === 429 || res.status >= 500) throw new ProviderUnavailableError('Demo API unavailable', res.status);
  if (res.status !== 200) throw new ProviderUnavailableError(`Unexpected status ${res.status}`, res.status);
  return res.json();
}

const auth = (session: Session) => ({ headers: { authorization: `Bearer ${String(session.token)}` } });

async function get(session: Session, ctx: ProviderContext, path: string, query?: Record<string, string>) {
  return check(await ctx.http.get(path, { ...auth(session), ...(query && { query }) }));
}

export const demoMinimal: DiaryProvider = {
  manifest,

  async login(credentials, ctx) {
    const res = await ctx.http.post(
      '/api/session',
      { username: credentials.login, password: credentials.password },
      { login: true },
    );
    return { token: sessionResponse.parse(check(res)).token };
  },

  async getAccount(session, ctx) {
    return mapAccount(meResponse.parse(await get(session, ctx, '/api/me')));
  },

  async getCalendar(session, student, ctx) {
    return mapCalendar(yearResponse.parse(await get(session, ctx, `/api/children/${student.externalId}/year`)));
  },

  async getSubjects(session, student, ctx) {
    return mapSubjects(coursesResponse.parse(await get(session, ctx, `/api/children/${student.externalId}/courses`)));
  },

  async getMarks(session, student, range, ctx) {
    const raw = await get(session, ctx, `/api/children/${student.externalId}/grades`, range);
    return mapGrades(gradesResponse.parse(raw), range);
  },

  sanitize(endpoint, raw) {
    if (endpoint !== 'me') return raw;
    const me = meResponse.parse(raw);
    return {
      id: 'u-1',
      name: 'Parent',
      children: me.children.map((c, i) => ({
        id: `c-${i + 1}`,
        first_name: `Student ${String.fromCharCode(65 + i)}`,
        last_name: 'Example',
        ...(c.group && { group: c.group }),
      })),
    };
  },
};

export { DEMO_ROUTES, demoTransport } from './fixtures';
