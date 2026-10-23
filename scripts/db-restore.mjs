// pnpm db:restore <file> --yes: puts a dump made by pnpm db:backup back into the local marksy database, replacing what
// is there (the dump drops and recreates every table). For the owner: stop pnpm dev first. It prints row counts per
// table before and after, never row contents.

import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { BACKUPS, counts, restoreInto } from './db-backup.mjs';

const file = process.argv[2];
// only a dump that db:backup made, in its folder; the restore runs in one transaction, so a failure changes nothing
const ours = !!file && resolve(dirname(file)) === resolve(BACKUPS) && /^marksy-[\w-]+\.sql\.gz$/.test(basename(file));
if (!file || !ours || !existsSync(file) || !process.argv.includes('--yes')) {
  console.error('usage: pnpm db:restore data/backups/marksy-<time>.sql.gz --yes');
  console.error('This replaces the local marksy database with the dump. Stop pnpm dev first.');
  process.exit(2);
}

const total = (m) => [...m.values()].reduce((s, n) => s + n, 0);
try {
  const before = counts('marksy');
  await restoreInto('marksy', file);
  const after = counts('marksy');
  console.log(
    `restored ${file}: ${after.size} tables, ${total(after)} rows (before: ${before.size} tables, ${total(before)} rows)`,
  );
} catch (err) {
  console.error(`db:restore failed: ${err.message}`);
  process.exit(1);
}
