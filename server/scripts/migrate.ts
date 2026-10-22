import { createDb, migrateDb } from '../src/db/client';

// `pnpm db:migrate`: applies server/drizzle/ to DATABASE_URL. Safe to re-run.
const db = createDb();
try {
  await migrateDb(db);
  console.log('migrations applied');
} finally {
  await db.$client.end();
}
