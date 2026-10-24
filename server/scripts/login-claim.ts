import { getProvider } from '@marksy/registry';
import { claimLogin, recordRefusedLogin, refusalText, runnerOf } from '../src/cli/login-guard';
import type { RefusedLogin } from '../src/cli/login-guard';
import { manualLoginPolicy } from '../src/cli/mode';
import { createDb, migrateDb } from '../src/db/client';

// `pnpm --filter @marksy/server login:claim --provider <id> [--refused auth|blocked|needs_2fa]`: asks the login guard
// (src/cli/login-guard.ts) for one real login of the probe, before the probe starts; with --refused, records after the
// probe that the diary refused the login it claimed. Run by the provider's probe script, never by hand. Exit 0: go
// ahead (the login is recorded); 3: refused, with the reason; 2: wrong use. It reads DIARY_LOGIN only to hash it.

const REFUSED: readonly RefusedLogin[] = ['auth', 'blocked', 'needs_2fa'];
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const provider = getProvider(arg('--provider') ?? '');
const refused = arg('--refused');
const login = process.env.DIARY_LOGIN?.trim();
if (!provider || !login || (refused !== undefined && !REFUSED.includes(refused as RefusedLogin))) {
  console.error('login:claim needs --provider <id>, DIARY_LOGIN in .env, and --refused only as auth|blocked|needs_2fa');
  process.exit(2);
}

const db = createDb();
try {
  await migrateDb(db);
  const { manifest } = provider;
  if (refused) {
    await recordRefusedLogin(db, { providerId: manifest.id, login, refused: refused as RefusedLogin });
  } else {
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
  }
} finally {
  await db.$client.end();
}
