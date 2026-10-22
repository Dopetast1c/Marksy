import { listProviders, getProvider } from '@marksy/registry';
import { createDb, migrateDb } from '../src/db/client';
import { masterKey } from '../src/crypto/credentials';
import { log } from '../src/log';
import { readSyncConfig } from '../src/sync/config';
import { formatReport, syncOnce } from '../src/sync/once';

// `pnpm sync:once [--provider <id>]`: one sync of the owner's own diary account from .env (DIARY_LOGIN,
// DIARY_PASSWORD) into the local database. It logs in to the real diary: only the owner runs it. The default provider
// is the first one offered to families (status stable or beta).

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const providerId = at >= 0 ? args[at + 1] : listProviders()[0]?.manifest.id;
const provider = providerId ? getProvider(providerId) : undefined;
const login = process.env.DIARY_LOGIN?.trim();
const password = process.env.DIARY_PASSWORD ?? '';

if (!provider) {
  console.error(`unknown provider ${providerId ?? ''}`);
  process.exit(2);
}
if (!login || !password) {
  console.error('DIARY_LOGIN and DIARY_PASSWORD must be set in .env');
  process.exit(2);
}

const db = createDb();
try {
  await migrateDb(db);
  const report = await syncOnce({
    db,
    provider,
    login,
    password,
    credentialsKey: masterKey(),
    config: readSyncConfig(),
    log,
  });
  for (const line of formatReport(report)) console.log(line);
  process.exitCode = report.result.outcome === 'ran' && report.result.status !== 'failed' ? 0 : 1;
} finally {
  await db.$client.end();
}
