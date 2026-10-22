import { createFixtureTransport } from '@marksy/core';
import courses from '../fixtures/courses.json';
import gradesEmpty from '../fixtures/grades-empty.json';
import grades from '../fixtures/grades.json';
import me from '../fixtures/me.json';
import session from '../fixtures/session.json';
import yearUnmarked from '../fixtures/year-unmarked.json';
import year from '../fixtures/year.json';

// The demo's API is its fixtures. Routes are matched in order: the second child sits in a year without marks.
export const DEMO_ROUTES: Record<string, string> = {
  'POST /api/session': 'session',
  'GET /api/me': 'me',
  'GET /api/children/c-2/year': 'year-unmarked',
  'GET /api/children/*/year': 'year',
  'GET /api/children/*/courses': 'courses',
  'GET /api/children/c-2/grades': 'grades-empty',
  'GET /api/children/*/grades': 'grades',
};

const FIXTURES = {
  session,
  me,
  year,
  'year-unmarked': yearUnmarked,
  courses,
  grades,
  'grades-empty': gradesEmpty,
};

/** A transport for the throttled client that answers like the demo API: collector tests and demo families use it. */
export function demoTransport() {
  return createFixtureTransport({ fixtures: FIXTURES, routes: DEMO_ROUTES });
}
