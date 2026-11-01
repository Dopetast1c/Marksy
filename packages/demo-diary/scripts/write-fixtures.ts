import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_LITE_SCHOOL_TITLE, generateGrade1, renderFixtures, seedCalendar } from '../src/index';

// `pnpm --filter @marksy/demo-diary fixtures`: writes providers/demo-lite/fixtures from the shared fictional school,
// on the prototype's demo day (Thursday 15 October 2026), so the provider's fixtures and the seed show the same child.
// Review the diff, then run `MARKSY_UPDATE_EXPECTED=1 pnpm test:provider demo-lite`.

const TODAY = '2026-10-15';
const MON_SAT = [1, 2, 3, 4, 5, 6];

const cal = seedCalendar(TODAY, MON_SAT, 1);
const { fixtures, routes } = renderFixtures(generateGrade1(TODAY, cal), cal, {
  weeks: ['2026-10-05', '2026-10-12'],
  termCode: 'q1',
  schoolTitle: DEMO_LITE_SCHOOL_TITLE,
});

const dir = fileURLToPath(new URL('../../../providers/demo-lite/fixtures/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const [name, value] of Object.entries(fixtures)) {
  writeFileSync(`${dir}${name}.json`, `${JSON.stringify(value, null, 2)}\n`);
}
writeFileSync(`${dir}routes.json`, `${JSON.stringify(routes, null, 2)}\n`);
console.log(`${Object.keys(fixtures).length} fixtures and routes.json in providers/demo-lite/fixtures`);
