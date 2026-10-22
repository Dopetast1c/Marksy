import {
  addDays,
  driftChecker,
  ProviderAuthError,
  ProviderUnavailableError,
  providerManifest,
  weekStartOf,
} from '@marksy/core';
import type { DiaryProvider, HttpResponse, ProviderContext, Session } from '@marksy/core';
import manifestJson from '../provider.json';
import { mapAccount, mapCalendar, mapFinal, mapLesson, mapSubjects } from './map';
import {
  authResponse,
  dayRaw,
  diaryResponse,
  finalRow,
  finalsResponse,
  profileResponse,
  subjectsResponse,
  yearResponse,
} from './schemas';

// demo-full: a fictional diary with a rich capability set (lessons with topics and homework, several marks per lesson,
// work and lesson types, comments, absences in the mark cell, quarters, holidays, finals) on a 10-point scale with a
// Monday week. It has no real system behind it; its "API" is the fixtures. The seeded demo family (pnpm db:seed)
// belongs to it, and the collector tests use it for everything demo-minimal lacks.

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

/** The envelope without its list, so the list items can be checked one by one and a broken item skipped */
function envelope(raw: unknown, list: string): [Record<string, unknown>, unknown] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [{}, undefined];
  const { [list]: items, ...rest } = raw as Record<string, unknown>;
  return [rest, items];
}

const pupil = (id: string) => `/api/v2/pupils/${encodeURIComponent(id)}`;

export const demoFull: DiaryProvider = {
  manifest,

  async login(credentials, ctx) {
    const res = await ctx.http.post(
      '/api/v2/auth',
      { user: credentials.login, pass: credentials.password },
      { login: true },
    );
    return { token: authResponse.parse(check(res)).access_token };
  },

  async getAccount(session, ctx) {
    return mapAccount(
      driftChecker(ctx.drift, 'profile').parse(profileResponse, await get(session, ctx, '/api/v2/profile')),
    );
  },

  async getCalendar(session, student, ctx) {
    const drift = driftChecker(ctx.drift, 'year');
    return mapCalendar(drift.parse(yearResponse, await get(session, ctx, `${pupil(student.externalId)}/year`)), drift);
  },

  async getSubjects(session, student, ctx) {
    const drift = driftChecker(ctx.drift, 'subjects');
    const raw = await get(session, ctx, `${pupil(student.externalId)}/subjects`);
    return mapSubjects(drift.items(subjectsResponse.element, raw, 'subjects'));
  },

  /** One request per week of the range; the API hands out Monday-to-Saturday weeks. */
  async getLessons(session, student, range, ctx) {
    const drift = driftChecker(ctx.drift, 'diary');
    const out = [];
    for (let week = weekStartOf(range.from, manifest.calendar.weekStart); week <= range.to; week = addDays(week, 7)) {
      const raw = await get(session, ctx, `${pupil(student.externalId)}/diary`, { week });
      const [rest, items] = envelope(raw, 'days');
      drift.shape(diaryResponse.omit({ days: true }), rest);
      const days = drift.items(dayRaw, items, 'days');
      for (const day of days) {
        if (day.date < range.from || day.date > range.to) continue;
        for (const l of day.lessons) out.push(mapLesson(day.date, l, drift));
      }
    }
    return out;
  },

  async getFinalMarks(session, student, ctx) {
    const drift = driftChecker(ctx.drift, 'finals');
    const raw = await get(session, ctx, `${pupil(student.externalId)}/finals`);
    const [rest, rows] = envelope(raw, 'rows');
    drift.shape(finalsResponse.omit({ rows: true }), rest);
    return drift.items(finalRow, rows, 'rows').map(mapFinal);
  },

  sanitize(endpoint, raw) {
    if (endpoint !== 'profile') return raw;
    const p = profileResponse.parse(raw);
    return {
      user_id: 'U-1',
      display_name: 'Родитель',
      pupils: p.pupils.map((x, i) => ({
        pupil_id: `p-${i + 1}`,
        name: { first: `Ученик ${'АБВГДЕ'[i] ?? i + 1}`, last: 'Пример' },
        school: 'S-1',
        class: { id: `C-${i + 1}`, title: x.class.title, year: x.class.year },
      })),
    };
  },
};

export { DEMO_FULL_FIXTURES, DEMO_FULL_ROUTES, demoFullTransport } from './fixtures';
