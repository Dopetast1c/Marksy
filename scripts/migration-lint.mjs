#!/usr/bin/env node
// `pnpm migrations:lint` (part of `pnpm check`): every new migration is an expansion (CLAUDE.md, "Migrations"), so that
// the previous release still runs on the migrated schema; the updater rolls back by putting the previous image on it.
// A new migration may add tables, nullable columns or columns with a default, indexes, and constraints on its own new
// tables or with NOT VALID. It may not drop or rename a table or a column, change a column's type, make a column NOT
// NULL, add a NOT NULL column without a default, add a validated constraint to an existing table, or build an index
// CONCURRENTLY (migrations run in one transaction).
// A removal is a contraction and takes two releases: the release that stops using the thing, then the migration that
// removes it, marked `-- marksy:contract expanded in vX.Y.Z` where X.Y.Z is the released version that stopped using
// it. The mark is accepted only once that version's tag exists.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const MIGRATIONS = join(root, 'server', 'drizzle');

/** Migrations up to this number were written before the rule and are not checked */
export const RULE_STARTS_AFTER = 13;

const RULES = [
  [/\bDROP\s+TABLE\b/i, 'drops a table'],
  [/\bDROP\s+COLUMN\b/i, 'drops a column'],
  [/\bRENAME\s+(COLUMN\s+)?("[^"]+"|\w+)\s+TO\b/i, 'renames a column'],
  [/\bRENAME\s+TO\b/i, 'renames a table'],
  [/\b(SET\s+DATA\s+TYPE|ALTER\s+COLUMN\s+("[^"]+"|\w+)\s+TYPE)\b/i, "changes a column's type"],
  [/\bSET\s+NOT\s+NULL\b/i, 'makes a column NOT NULL'],
  [/\bCONCURRENTLY\b/i, 'builds an index CONCURRENTLY (migrations run in one transaction)'],
  [/\bDROP\s+TYPE\b/i, 'drops a type'],
];

const CONTRACT = /--\s*marksy:contract\s+expanded\s+in\s+v?(\d+\.\d+\.\d+)/i;

/** The statements of a migration file, without comments */
function statements(text) {
  return text
    .split('--> statement-breakpoint')
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

/** Problems of one migration's text, as short English reasons */
export function migrationProblems(text, opts = { released: () => false }) {
  const contract = text.match(CONTRACT);
  if (contract) {
    return opts.released(contract[1])
      ? []
      : [`marked as a contraction of ${contract[1]}, but v${contract[1]} is not released yet`];
  }
  const problems = [];
  const created = new Set();
  for (const s of statements(text)) {
    const table = s.match(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i);
    if (table) created.add(table[2].replaceAll('"', ''));
  }
  for (const s of statements(text)) {
    for (const [re, reason] of RULES) if (re.test(s)) problems.push(reason);
    const altered = s.match(/^ALTER\s+TABLE\s+(ONLY\s+)?("?[\w.]+"?)/i)?.[2]?.replaceAll('"', '');
    if (!altered || created.has(altered)) continue;
    if (/\bADD\s+CONSTRAINT\b/i.test(s) && !/\bNOT\s+VALID\b/i.test(s))
      problems.push('adds a validated constraint to an existing table (use NOT VALID, validate in a later release)');
    const add = s.match(/\bADD\s+COLUMN\b(.*)$/is)?.[1];
    if (add && /\bNOT\s+NULL\b/i.test(add) && !/\bDEFAULT\b/i.test(add))
      problems.push('adds a NOT NULL column without a default to an existing table');
  }
  return [...new Set(problems)];
}

const released = (version) =>
  spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/v${version}`], { cwd: root }).status === 0;

function main() {
  let bad = 0;
  let checked = 0;
  for (const file of readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f))) {
    if (Number(file.slice(0, 4)) <= RULE_STARTS_AFTER) continue;
    checked++;
    const problems = migrationProblems(readFileSync(join(MIGRATIONS, file), 'utf8'), { released });
    if (!problems.length) continue;
    bad++;
    console.error(`server/drizzle/${file}:`);
    for (const p of problems) console.error(`  - ${p}`);
  }
  if (bad) {
    console.error(
      `migrations: ${bad} would break the previous release; expand now and contract two releases later (CLAUDE.md, "Migrations")`,
    );
    return 1;
  }
  console.log(`migrations: ${checked} checked, ok`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
