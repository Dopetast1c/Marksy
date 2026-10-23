import { getProvider, listProviders } from '@marksy/registry';
import { claimLogin, refusalText, runnerOf } from '../src/cli/login-guard';
import { createDb, migrateDb } from '../src/db/client';
import { masterKey } from '../src/crypto/credentials';
import { errorSummary, log } from '../src/log';
import { readSyncConfig } from '../src/sync/config';
import { exitCodeOf, formatReport, syncOnce } from '../src/sync/once';

// `pnpm sync:once [--provider <id>]`: one sync of the owner's own diary account from .env (DIARY_LOGIN,
// DIARY_PASSWORD) into the local database. It logs in to the real diary: the owner runs it, or Claude Code within the
// login guard (CLAUDE.md, Real diary runs; src/cli/login-guard.ts). The default provider
// is the first one offered to families (status stable or beta); fixture-only providers are refused, so the real login
// is never sent anywhere else.

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const offered = listProviders();
const providerId = at >= 0 ? args[at + 1] : offered[0]?.manifest.id;
const provider = providerId ? getProvider(providerId) : undefined;
const login = process.env.DIARY_LOGIN?.trim();
const password = process.env.DIARY_PASSWORD ?? '';

if (!provider || !offered.includes(provider)) {
  console.error(
    `provider ${providerId ?? ''} is not one offered to families: ${offered.map((p) => p.manifest.id).join(', ')}`,
  );
  process.exit(2);
}
if (!login || !password) {
  console.error('DIARY_LOGIN and DIARY_PASSWORD must be set in .env');
  process.exit(2);
}

const db = createDb();
try {
  await migrateDb(db);
  const runner = runnerOf();
  const manifest = provider.manifest;
  const claim = await claimLogin(db, {
    providerId: manifest.id,
    login,
    command: 'sync:once',
    runner,
    minLoginIntervalMinutes: manifest.limits.minLoginIntervalMinutes,
    timezone: manifest.timezone,
    now: new Date(),
  });
  if (!claim.ok) {
    console.error(refusalText(claim, manifest.timezone));
    // the owner's run held back by the interval ends like a run the gate held back (0); every other refusal is not 0
    process.exit(runner === 'owner' && claim.reason === 'interval' ? 0 : 3);
  }
  const report = await syncOnce({
    trigger: runner === 'claude' ? 'cli-claude' : 'cli',
    db,
    provider,
    login,
    password,
    credentialsKey: masterKey(),
    config: readSyncConfig(),
    log,
  });
  for (const line of formatReport(report)) console.log(line);
  process.exitCode = exitCodeOf(report);
} catch (err) {
  // a database error carries its query parameters, the login among them: only the class and code are shown
  console.error(`sync:once failed: ${errorSummary(err)}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
