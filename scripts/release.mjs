#!/usr/bin/env node
// `pnpm release <command>` (CLAUDE.md, "Commits and releases"; docs/build-plan.md, "Versions"):
//   propose          the next version from the commits since the last release tag, and why; never a decision
//   notes <version>  the release notes: Features and Fixes from the commits, migrations, the documentation links
//   prepare <version>  writes the version into the root package.json (then commit it as chore(release): <version>)
//   tags <version>   the image tags the release workflow puts on that version (X.Y.Z, and X.Y, X, stable when newest)
// A feat raises MINOR, a fix or a perf PATCH; docs, test, chore, ci, build and refactor alone release nothing; a
// breaking commit stops the proposal (exit code 3) so the owner decides the number. The first release is 1.0.0.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCommit } from './conventional.mjs';
import { RULE_STARTS_AFTER } from './commit-lint.mjs';

export const FIRST_VERSION = '1.0.0';
const REPO = 'https://github.com/Dopetast1c/Marksy';
/** The twelve languages of the README, English first (docs/i18n.md 7); the other pages are English only */
export const DOC_LANGUAGES = [
  ['en', 'English'],
  ['ru', 'Russian'],
  ['be', 'Belarusian'],
  ['uk', 'Ukrainian'],
  ['kk', 'Kazakh'],
  ['pl', 'Polish'],
  ['de', 'German'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['fr', 'French'],
  ['nl', 'Dutch'],
  ['ro', 'Romanian'],
];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v) {
  const m = String(v).replace(/^v/, '').match(SEMVER);
  if (!m) throw new Error(`not a version: ${v}`);
  return m.slice(1).map(Number);
}

export const compareVersions = (a, b) => {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/**
 * The next version from the last release and the commit messages since it.
 * { status: 'release', version, bump, reason } | { status: 'none', reason } | { status: 'ask', reason, breaking }
 */
export function nextVersion(lastVersion, messages) {
  const commits = messages.map(parseCommit).filter((c) => c?.kind === 'commit');
  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length)
    return {
      status: 'ask',
      reason: `breaking change: ${breaking.map((c) => c.header).join('; ')}; the owner decides the number`,
      breaking: breaking.map((c) => c.header),
    };
  if (!lastVersion) return { status: 'release', version: FIRST_VERSION, bump: 'first', reason: 'the first release' };
  const [major, minor, patch] = parseVersion(lastVersion);
  const feats = commits.filter((c) => c.type === 'feat');
  if (feats.length)
    return {
      status: 'release',
      version: `${major}.${minor + 1}.0`,
      bump: 'minor',
      reason: `new features: ${feats.map((c) => c.subject).join('; ')}`,
    };
  const fixes = commits.filter((c) => c.type === 'fix' || c.type === 'perf');
  if (fixes.length)
    return {
      status: 'release',
      version: `${major}.${minor}.${patch + 1}`,
      bump: 'patch',
      reason: `fixes: ${fixes.map((c) => c.subject).join('; ')}`,
    };
  return { status: 'none', reason: 'only docs, tests, chores, CI, build or refactoring since the last release' };
}

/**
 * The image tags a release gets: always X.Y.Z; X.Y, X and stable only when it is the newest of that line, so a late
 * fix of an older line never moves a line backwards
 */
export function imageTags(version, existing) {
  const [major, minor] = parseVersion(version);
  const others = existing.filter((v) => SEMVER.test(String(v).replace(/^v/, '')));
  const newest = (filter) => others.filter(filter).every((v) => compareVersions(version, v) >= 0);
  const tags = [version];
  if (newest((v) => parseVersion(v)[0] === major && parseVersion(v)[1] === minor)) tags.push(`${major}.${minor}`);
  if (newest((v) => parseVersion(v)[0] === major)) tags.push(`${major}`);
  if (newest(() => true)) tags.push('stable');
  return tags;
}

const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The release notes in Markdown: plain English from the commit subjects, no names or data */
export function releaseNotes(version, messages, { migrations = [] } = {}) {
  const commits = messages.map(parseCommit).filter((c) => c?.kind === 'commit');
  const list = (types) =>
    commits
      .filter((c) => types.includes(c.type))
      .map((c) => `- ${sentence(c.subject)}${c.scope ? ` (${c.scope})` : ''}`);
  const features = list(['feat']);
  const fixes = list(['fix', 'perf']);
  const tag = `v${version}`;
  const readme = (lang) => `${REPO}/blob/${tag}/${lang === 'en' ? 'README.md' : `README.${lang}.md`}`;
  const lines = [`## Marksy ${version}`, ''];
  if (features.length) lines.push('### Features', '', ...features, '');
  if (fixes.length) lines.push('### Fixes', '', ...fixes, '');
  lines.push(
    '### Database',
    '',
    migrations.length
      ? `This release changes the database (${migrations.length} migration${migrations.length > 1 ? 's' : ''}: ${migrations.join(', ')}). The server applies the changes when it starts, in one transaction, and takes a backup first when it updates itself; the previous version keeps working on the new database.`
      : 'No database changes.',
    '',
    '### Documentation',
    '',
    `- README: ${DOC_LANGUAGES.map(([lang, name]) => `[${name}](${readme(lang)})`).join(' · ')}`,
    `- [Running Marksy at home](${REPO}/blob/${tag}/docs/running.md) · [Adding a diary system](${REPO}/blob/${tag}/docs/adding-a-diary.md)`,
    '',
    `Images: \`ghcr.io/dopetast1c/marksy-server:${version}\`, \`ghcr.io/dopetast1c/marksy-web:${version}\` and \`ghcr.io/dopetast1c/marksy-updater:${version}\`, for linux/amd64 and linux/arm64, signed. The files a host needs are attached as \`marksy-deploy-${tag}.zip\`, the documentation of this version as \`marksy-docs-${tag}.zip\`.`,
    '',
  );
  return lines.join('\n');
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The last release tag reachable from HEAD, or null before the first release */
export function lastTag() {
  return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*']);
}

function messagesSince(from) {
  const out =
    git(['log', '--no-merges', '--format=%B%x1e', from ? `${from}..HEAD` : `${RULE_STARTS_AFTER}..HEAD`]) ?? '';
  return out
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean);
}

function migrationsSince(from) {
  const out =
    git(['diff', '--name-only', '--diff-filter=A', from ?? RULE_STARTS_AFTER, 'HEAD', '--', 'server/drizzle/']) ?? '';
  return out
    .split('\n')
    .filter((f) => /\.sql$/.test(f))
    .map((f) =>
      f
        .split('/')
        .pop()
        .replace(/\.sql$/, ''),
    );
}

function main([command, arg]) {
  const tag = lastTag();
  const since = tag ? tag.replace(/^v/, '') : null;
  if (command === 'propose') {
    const r = nextVersion(since, messagesSince(tag));
    console.log(`last release: ${tag ?? 'none'}`);
    if (r.status === 'release') console.log(`proposed: ${r.version} (${r.bump}): ${r.reason}`);
    else console.log(`${r.status === 'none' ? 'nothing to release' : 'ask the owner'}: ${r.reason}`);
    return r.status === 'ask' ? 3 : 0;
  }
  if (command === 'notes') {
    parseVersion(arg ?? '');
    process.stdout.write(releaseNotes(arg, messagesSince(tag), { migrations: migrationsSince(tag) }));
    return 0;
  }
  if (command === 'tags') {
    parseVersion(arg ?? '');
    const existing = (git(['tag', '-l', 'v[0-9]*.[0-9]*.[0-9]*']) ?? '').split('\n').filter(Boolean);
    console.log(imageTags(arg, existing).join(' '));
    return 0;
  }
  if (command === 'prepare') {
    parseVersion(arg ?? '');
    if (since && compareVersions(arg, since) <= 0) {
      console.error(`${arg} is not above the last release ${since}`);
      return 2;
    }
    const file = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = readFileSync(file, 'utf8');
    writeFileSync(file, pkg.replace(/"version": "[^"]+"/, `"version": "${arg}"`));
    console.log(
      `package.json: ${arg}; commit it as "chore(release): ${arg}", wait for the images of that commit, then create the release v${arg}`,
    );
    return 0;
  }
  console.error('pnpm release propose | notes <version> | prepare <version>');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
