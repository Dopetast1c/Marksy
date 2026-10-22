// pnpm probe [--provider <id>]: runs a provider's own probe script (docs/providers.md 8). It logs in to the real
// diary with the logins in .env, so only the owner runs it, from their own terminal. Without --provider it picks the
// only provider that has a probe.
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
const res = spawnSync('pnpm', ['--dir', `providers/${id}`, 'probe'], { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
