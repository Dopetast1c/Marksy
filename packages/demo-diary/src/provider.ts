import {
  addDays,
  createFixtureTransport,
  driftChecker,
  ProviderAuthError,
  ProviderUnavailableError,
  providerManifest,
  weekStartOf,
} from '@marksy/core';
import type { DiaryProvider, HttpResponse, ProviderContext, Session, TransportRequest } from '@marksy/core';
import {
  authResponse,
  bellsRaw,
  dayRaw,
  diaryResponse,
  finalRow,
  finalsResponse,
  profileResponse,
  subjectRaw,
  timetableRaw,
  yearResponse,
} from './api';
import {
  mapAccount,
  mapBells,
  mapCalendar,
  mapFinal,
  mapLesson,
  mapSubjects,
  mapTimetable,
  stripLesson,
  stripSubject,
  stripTemplate,
} from './map';

// One fictional diary API, several fictional providers (docs/providers.md 2): demo-full and demo-lite are this code
// with their own manifest and fixtures. Methods a manifest does not promise are not there, and fields it does not
// promise are dropped, so each provider looks exactly like a system with that capability set.

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

/** Replaces names and ids in the profile, the only response with personal data; everything else is fictional anyway */
export function sanitizeDemo(endpoint: string, raw: unknown): unknown {
  if (endpoint !== 'profile') return raw;
  const p = profileResponse.parse(raw);
  return {
    user_id: 'U-1',
    display_name: 'Родитель',
    pupils: p.pupils.map((x, i) => ({
      pupil_id: `p-${i + 1}`,
      name: { first: `Ученик ${'АБВГДЕ'[i] ?? i + 1}`, last: 'Пример' },
      school: 'S-1',
      ...(x.school_title !== undefined && { school_title: x.school_title }),
      class: { id: `C-${i + 1}`, title: x.class.title, year: x.class.year },
    })),
  };
}

export function createDemoProvider(manifestJson: unknown): DiaryProvider {
  const manifest = providerManifest.parse(manifestJson);
  const caps = manifest.capabilities;

  const provider: DiaryProvider = {
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
      const raw = await get(session, ctx, '/api/v2/profile');
      return mapAccount(driftChecker(ctx.drift, 'profile').parse(profileResponse, raw));
    },

    async getCalendar(session, student, ctx) {
      const drift = driftChecker(ctx.drift, 'year');
      return mapCalendar(
        drift.parse(yearResponse, await get(session, ctx, `${pupil(student.externalId)}/year`)),
        drift,
      );
    },

    async getSubjects(session, student, ctx) {
      const drift = driftChecker(ctx.drift, 'subjects');
      const raw = await get(session, ctx, `${pupil(student.externalId)}/subjects`);
      return mapSubjects(drift.items(subjectRaw, raw, 'subjects'), drift).map((s) => stripSubject(s, caps));
    },

    /** One request per week of the range; the API hands out Monday-to-Saturday weeks. */
    async getLessons(session, student, range, ctx) {
      const drift = driftChecker(ctx.drift, 'diary');
      const out = [];
      for (let week = weekStartOf(range.from, manifest.calendar.weekStart); week <= range.to; week = addDays(week, 7)) {
        const raw = await get(session, ctx, `${pupil(student.externalId)}/diary`, { week });
        const [rest, items] = envelope(raw, 'days');
        drift.shape(diaryResponse.omit({ days: true }), rest);
        for (const day of drift.items(dayRaw, items, 'days')) {
          if (day.date < range.from || day.date > range.to) continue;
          for (const l of day.lessons) out.push(stripLesson(mapLesson(day.date, l, drift), caps));
        }
      }
      return out;
    },

    sanitize: sanitizeDemo,
  };

  if (caps.finalMarks) {
    provider.getFinalMarks = async (session, student, ctx) => {
      const drift = driftChecker(ctx.drift, 'finals');
      const [rest, rows] = envelope(await get(session, ctx, `${pupil(student.externalId)}/finals`), 'rows');
      drift.shape(finalsResponse.omit({ rows: true }), rest);
      return drift.items(finalRow, rows, 'rows').map(mapFinal);
    };
  }
  if (caps.bellSchedule) {
    provider.getBellSchedule = async (session, student, ctx) => {
      const drift = driftChecker(ctx.drift, 'bells');
      return mapBells(drift.items(bellsRaw, await get(session, ctx, `${pupil(student.externalId)}/bells`), 'bells'));
    };
  }
  if (caps.weekTemplate) {
    provider.getWeekTemplate = async (session, student, ctx) => {
      const drift = driftChecker(ctx.drift, 'timetable');
      const raw = drift.parse(timetableRaw, await get(session, ctx, `${pupil(student.externalId)}/timetable`));
      return stripTemplate(mapTimetable(raw), caps);
    };
  }
  return provider;
}

/** A transport for the throttled client that answers like the demo API from a provider's fixtures */
export function demoTransportOf(
  fixtures: Readonly<Record<string, unknown>>,
  routes: Readonly<Record<string, string>>,
  opts: { fixtures?: Record<string, unknown>; log?: TransportRequest[] } = {},
) {
  return createFixtureTransport({
    fixtures: { ...fixtures, ...opts.fixtures },
    routes,
    ...(opts.log && { log: opts.log }),
  });
}
