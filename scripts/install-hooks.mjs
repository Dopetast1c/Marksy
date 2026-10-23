// Run by `pnpm install` (the prepare script): this clone's git uses the hooks in .githooks/ (the pre-commit guard,
// scripts/commit-guard.mjs). Outside a git checkout (a downloaded archive) there is nothing to install.
import { spawnSync } from 'node:child_process';

const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (inside.status === 0 && inside.stdout.trim() === 'true') {
  const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  if (set.status !== 0) process.exit(set.status ?? 1);
}
