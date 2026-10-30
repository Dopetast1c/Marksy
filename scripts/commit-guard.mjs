// The pre-commit guard (CLAUDE.md "Real diary runs"; .githooks/pre-commit, installed by `pnpm install`). Refuses a
// commit that stages anything under data/, an environment file other than env.example, an SQL dump, a raw response;
// runs the privacy check on the staged files; and checks them against the local deny-list that `pnpm probe` builds
// from the latest raw responses (data/deny-list.json: the children's and teachers' names, the account's and school's
// ids). A hit names the file and the line, never the value. The commit-msg hook checks the message the same way
// (--message <file>). Never bypassed: no --no-verify.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = [
  { re: /^data\//, why: 'the local data folder (real responses, dumps, the deny-list)' },
  // every .env* (.env, .env.local, .env.prod, «.env - Copy»): the public template is env.example, without the dot
  { re: /(^|\/)\.env[^/]*$/, why: 'an environment file with secrets' },
  { re: /\.sql\.gz$|\.(dump|backup)$/i, why: 'a database dump' },
  // migrations are the only SQL in the repository
  { re: /^(?!server\/drizzle\/\d{4}_[a-z0-9_]+\.sql$).*\.sql$/i, why: 'an SQL file outside server/drizzle (a dump?)' },
  { re: /\.har$/i, why: 'a HAR export' },
  { re: /(^|\/)raw\//, why: 'a raw responses folder' },
  { re: /(^|\/)\d{2,}-[a-z0-9_-]+\.json$/, why: 'a raw probe response (NN-name.json)' },
];

/** Why a staged path may never be committed, or null */
export function forbiddenPath(path) {
  return FORBIDDEN.find((f) => f.re.test(path))?.why ?? null;
}

/** data/deny-list.json as sets for matching, or null when no probe ran on this machine yet */
export function loadDenyList(root) {
  const file = join(root, 'data', 'deny-list.json');
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const low = (a) => (Array.isArray(a) ? a.map((s) => fold(String(s))).filter(Boolean) : []);
  return { words: new Set(low(raw.words)), phrases: low(raw.phrases), ids: low(raw.ids) };
}

const YO = String.fromCodePoint(0x451);
const YE = String.fromCodePoint(0x435);
/** Lower case, Cyrillic yo (U+0451) as ye (U+0435): a name written either way is the same name */
const fold = (s) => s.toLowerCase().replaceAll(YO, YE);

const tokens = (line) =>
  fold(line)
    .split(/[^\p{L}-]+/u)
    .flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]))
    .filter(Boolean);

/** Line numbers (1-based) of a text that hold a deny-listed value */
export function denyHits(text, deny) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    const low = fold(line);
    const words = new Set([...deny.words].map(fold));
    if (
      deny.phrases.some((p) => low.includes(fold(p))) ||
      deny.ids.some((id) => low.includes(fold(id))) ||
      tokens(line).some((t) => words.has(t))
    )
      hits.push(i + 1);
  });
  return hits;
}

/** Problems of the staged files ({ path, text }; text null for a binary or deleted file), as file and line only */
export function checkStaged(files, deny) {
  const problems = [];
  for (const f of files) {
    const why = forbiddenPath(f.path);
    if (why) problems.push(`${f.path}: ${why} must never be committed`);
    if (deny && f.text != null)
      for (const line of denyHits(f.text, deny))
        problems.push(`${f.path}:${line}: a name or id from the real diary (data/deny-list.json)`);
  }
  return problems;
}

function git(args, root) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`);
  return r.stdout;
}

/** The staged files with their staged contents */
export function stagedFiles(root) {
  const names = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], root)
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  return names.map((path) => {
    const blob = git(['show', `:${path}`], root);
    return { path, text: blob.includes(0) ? null : blob.toString('utf8') };
  });
}

/** The commit-msg hook: the message, too, never carries a real name or id. The refusal, or null */
export function messageProblem(text, deny) {
  const hits = deny ? denyHits(text, deny) : [];
  return hits.length
    ? `commit refused: the commit message, line ${hits.join(', ')}, has a name or id from the real diary`
    : null;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const at = process.argv.indexOf('--message');
  if (at >= 0) {
    const problem = messageProblem(readFileSync(process.argv[at + 1], 'utf8'), loadDenyList(root));
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    return;
  }
  const deny = loadDenyList(root);
  const problems = checkStaged(stagedFiles(root), deny);
  if (problems.length) {
    console.error(`commit refused by the pre-commit guard:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    console.error('Unstage or fix these; never bypass the guard (CLAUDE.md, Real diary runs).');
    process.exit(1);
  }
  if (!deny) console.log('pre-commit: no data/deny-list.json yet (pnpm probe builds it); names were not checked');
  const privacy = spawnSync(process.execPath, [join(root, 'scripts', 'privacy-check.mjs'), '--staged'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (privacy.status !== 0) process.exit(1);
}

if (process.argv[1]?.endsWith('commit-guard.mjs')) main();
