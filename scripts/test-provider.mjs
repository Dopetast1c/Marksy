// pnpm test:provider <id>: the shared conformance suite and the provider's own tests (docs/providers.md 8).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const id = process.argv[2];
// the id goes into a shell command (pnpm is a .cmd on Windows), so only provider-id characters are accepted
if (!id || !/^[a-z0-9_-]+$/.test(id) || !existsSync(`providers/${id}/package.json`)) {
  console.error(`usage: pnpm test:provider <id>; ${id ? `no provider "${id}" in providers/` : 'no id given'}`);
  process.exit(2);
}
const res = spawnSync('pnpm', ['--dir', `providers/${id}`, 'exec', 'vitest', 'run'], { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
