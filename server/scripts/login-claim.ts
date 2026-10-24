import { getProvider } from '@marksy/registry';
import { claimLogin, refusalText, runnerOf } from '../src/cli/login-guard';
import { manualLoginPolicy } from '../src/cli/mode';
import { createDb, migrateDb } from '../src/db/client';

// `pnpm --filter @marksy/server login:claim --provider <id>`: asks the login guard (src/cli/login-guard.ts) for one real
// login of the probe, before the probe starts. Run by scripts/probe.mjs, never by hand. Exit 0: go ahead (the login is
// recorded); 3: refused, with the next allowed time; 2: wrong use. It reads DIARY_LOGIN only to hash it.

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const provider = at >= 0 ? getProvider(args[at + 1] ?? '') : undefined;
const login = process.env.DIARY_LOGIN?.trim();
if (!provider || !login) {
  console.error('login:claim needs --provider <id> and DIARY_LOGIN in .env');
  process.exit(2);
}

const db = createDb();
try {
  await migrateDb(db);
  const { manifest } = provider;
  const policy = manualLoginPolicy(manifest);
  const claim = await claimLogin(db, {
    providerId: manifest.id,
    login,
    command: 'probe',
    runner: runnerOf(),
    policy,
    timezone: manifest.timezone,
    now: new Date(),
  });
  if (!claim.ok) {
    console.error(refusalText(claim, manifest.timezone, policy));
    process.exitCode = 3;
  }
} finally {
  await db.$client.end();
}
