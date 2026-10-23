import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db/client';
import { readSyncConfig } from '../src/sync/config';
import { loadManifests, planReport } from '../src/sync/plan-report';

// `pnpm sync:plan`: the planner's dry run on the local database. It logs in nowhere and cannot (see plan-report.ts):
// for every diary account, today's window of each child, what is waiting, and whether a run would start now.
const providersDir = fileURLToPath(new URL('../../providers/', import.meta.url));
const db = createDb();
try {
  for (const line of await planReport(db, loadManifests(providersDir), readSyncConfig(), new Date())) console.log(line);
} finally {
  await db.$client.end();
}
