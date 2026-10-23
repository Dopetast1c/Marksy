import { createDemoProvider } from '@marksy/demo-diary';
import manifestJson from '../provider.json';

// demo-full: the fictional demo diary (packages/demo-diary) with a rich capability set: lessons with topics and
// homework, several marks per lesson, work and lesson types, comments, absences in the mark cell, quarters, holidays,
// finals, and the school details (bells, the regular week, rooms, subgroups, teachers) on a 10-point scale with a
// Monday week. No real system behind it; its "API" is the fixtures. The collector tests use it for everything
// demo-minimal lacks.

export const demoFull = createDemoProvider(manifestJson);
export const manifest = demoFull.manifest;

export { DEMO_FULL_FIXTURES, DEMO_FULL_ROUTES, demoFullTransport } from './fixtures';
