// pnpm probe [--provider <id>] [--weeks <1-8>] [--next]: runs a provider's own probe script (docs/providers.md 8);
// --next reads the next school week too. It logs in to
// the real diary with the logins in .env, after the login guard allowed it (the provider's probe asks it itself,
// server/src/cli/login-guard.ts and mode.ts: one login per account per interval, 10 minutes in development and the
// manifest's in production, where Claude Code also has three runs a day, 07:00 to 20:00).
// pnpm probe --offline [run] re-runs the provider's probe on saved raw responses in data/probe/ without a login.
// Without --provider it picks the only provider that has a probe.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = args.indexOf('--provider');
let id = flag >= 0 ? args[flag + 1] : undefined;

const withProbe = readdirSync('providers').filter((p) => {
  const pkg = `providers/${p}/package.json`;
  return existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).scripts?.probe;
});
if (!id) {
  if (withProbe.length !== 1) {
    console.error(`usage: pnpm probe --provider <id>; providers with a probe: ${withProbe.join(', ') || 'none'}`);
    process.exit(2);
  }
  id = withProbe[0];
}
// the id goes into a shell command (pnpm is a .cmd on Windows), so only provider-id characters are accepted
if (!/^[a-z0-9_-]+$/.test(id) || !withProbe.includes(id)) {
  console.error(`no probe for provider "${id}"; providers with a probe: ${withProbe.join(', ') || 'none'}`);
  process.exit(2);
}
// the rest goes to the provider's probe; it ends up in a shell command too, so only known options are passed on
const rest = flag >= 0 ? args.filter((_, i) => i !== flag && i !== flag + 1) : args;
const offline = rest[0] === '--offline';
/** --weeks N and --next, each at most once, in any order */
function onlineOptions(xs) {
  const seen = new Set();
  for (let i = 0; i < xs.length; i++) {
    if (seen.has(xs[i])) return false;
    seen.add(xs[i]);
    if (xs[i] === '--next') continue;
    if (xs[i] === '--weeks' && /^\d{1,2}$/.test(xs[i + 1] ?? '')) i++;
    else return false;
  }
  return true;
}
const known = offline
  ? rest.length === 1 || (rest.length === 2 && /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(rest[1]))
  : onlineOptions(rest);
if (!known) {
  console.error('options: --provider <id>, --weeks <1-8>, --next, or --offline [the run folder in data/probe/]');
  process.exit(2);
}
const command = offline
  ? ['--dir', `providers/${id}`, 'probe:offline', ...rest.slice(1)]
  : ['--dir', `providers/${id}`, 'probe', ...rest];
// MARKSY_PROBE_DRY_RUN=1 prints what would run and stops: the launcher can be tested without ever logging in
if (process.env.MARKSY_PROBE_DRY_RUN === '1') {
  console.log(`dry run: pnpm ${command.join(' ')}`);
  process.exit(0);
}
const res = spawnSync('pnpm', command, { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
