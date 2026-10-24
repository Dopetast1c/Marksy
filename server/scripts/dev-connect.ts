import { listProviders } from '@marksy/registry';
import { runnerOf } from '../src/cli/login-guard';
import { masterKey } from '../src/crypto/credentials';
import { createDb, migrateDb } from '../src/db/client';
import { devConnect } from '../src/family/dev-connect';
import { errorSummary } from '../src/log';

// `pnpm dev:connect [--provider <id>]`: the owner's family from .env (DIARY_LOGIN, DIARY_PASSWORD for the diary,
// MARKSY_DEV_EMAIL, MARKSY_DEV_PASSWORD for the Marksy login), through the same service as «Подключить дневник»
// (src/family/dev-connect.ts). It may log in to the real diary: only the owner runs it. Prints the outcome and counts.

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const providerId = at >= 0 ? args[at + 1] : listProviders()[0]?.manifest.id;
const env = (k: string) => process.env[k]?.trim() ?? '';
const missing = ['DIARY_LOGIN', 'DIARY_PASSWORD', 'MARKSY_DEV_EMAIL', 'MARKSY_DEV_PASSWORD'].filter((k) => !env(k));
if (!providerId || missing.length) {
  console.error(`dev:connect needs ${missing.join(', ') || 'a provider'} in .env (see .env.example)`);
  process.exit(2);
}

const db = createDb();
try {
  await migrateDb(db);
  const result = await devConnect(db, {
    providerId,
    diary: { login: env('DIARY_LOGIN'), password: process.env.DIARY_PASSWORD ?? '' },
    marksy: { login: env('MARKSY_DEV_EMAIL'), password: process.env.MARKSY_DEV_PASSWORD ?? '' },
    runner: runnerOf(),
    credentialsKey: masterKey(),
  });
  if (result.outcome === 'refused') {
    console.error(result.message);
    process.exitCode = 3;
  } else {
    console.log(`dev:connect: ${result.outcome}, ${result.children} children followed`);
    console.log('Sign in to the app with MARKSY_DEV_EMAIL and MARKSY_DEV_PASSWORD.');
  }
} catch (err) {
  // the error's class and code only: a message could carry the login
  const code = (err as { code?: unknown }).code;
  console.error(`dev:connect failed: ${typeof code === 'string' ? code : errorSummary(err)}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
