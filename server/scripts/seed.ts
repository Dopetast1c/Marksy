import { createDb, migrateDb } from '../src/db/client';
import { DEMO_LOGINS, DEMO_PASSWORD, seedDemo } from '../src/seed/seed';

// `pnpm db:seed [--reset]`: the fictional demo family with demo logins, for anyone without a diary account and for
// building screens. It never touches another family; --reset replaces only the demo family.
const reset = process.argv.includes('--reset');
const db = createDb();
try {
  await migrateDb(db);
  const r = await seedDemo(db, { reset });
  console.log(r.created ? 'demo family created' : 'demo family already exists (pnpm db:seed --reset replaces it)');
  for (const [table, n] of Object.entries(r.counts)) console.log(`  ${table}: ${n}`);
  console.log(`logins: ${DEMO_LOGINS.parent} (parent, admin), ${DEMO_LOGINS.student} (student)`);
  console.log(`password for both: ${DEMO_PASSWORD}`); // privacy-ok: the published password of the fictional demo family
} finally {
  await db.$client.end();
}
