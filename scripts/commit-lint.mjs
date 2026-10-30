#!/usr/bin/env node
// `pnpm commit:lint`: commit messages follow Conventional Commits in English (CLAUDE.md, "Commits and releases").
//   --message <file>   one message (the commit-msg hook)
//   --range <a..b>     every commit of a range (CI); commits up to the start of the rule are exempt
// A header is `type(scope)!: subject` with one of the types of scripts/conventional.mjs, at most 100 characters; a
// longer message has a blank line after the header; git's own merge and revert headers are allowed; nothing is in
// another language.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanMessage, parseCommit, TYPES } from './conventional.mjs';
import { messageProblems } from './language-check.mjs';

/** The commit the rule starts after: main when R1 began; everything before it keeps its old style */
export const RULE_STARTS_AFTER = '7a5de14416c8a9e0904e1ebac07d81b8a4a3a4ca';

/** Problems of one message, as short English reasons */
export function lintMessage(message) {
  const text = cleanMessage(message);
  const problems = [...messageProblems(text)];
  const parsed = parseCommit(text);
  const [header = '', second] = text.split('\n');
  if (!parsed) problems.push(`the first line is not "type(scope): subject" with a type of ${TYPES.join(', ')}`);
  if (header.length > 100) problems.push('the first line is longer than 100 characters');
  if (second !== undefined && second.trim() !== '') problems.push('a blank line must follow the first line');
  return problems;
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`);
  return r.stdout;
}

/** The commits of a range that the rule covers, with their messages */
export function commitsOf(range) {
  const known = spawnSync('git', ['cat-file', '-e', `${RULE_STARTS_AFTER}^{commit}`]).status === 0;
  const out = git(['log', '--format=%H%x00%B%x1e', range, ...(known ? [`^${RULE_STARTS_AFTER}`] : [])]);
  return out
    .split('\x1e')
    .map((s) => s.replace(/^\n/, ''))
    .filter(Boolean)
    .map((s) => {
      const [sha, message] = s.split('\x00');
      return { sha, message };
    });
}

function main(args) {
  const at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const file = at('--message');
  const range = at('--range');
  const items = file ? [{ sha: 'this commit', message: readFileSync(file, 'utf8') }] : range ? commitsOf(range) : null;
  if (!items) {
    console.error('commit:lint --message <file> | --range <a..b>');
    return 2;
  }
  let bad = 0;
  for (const { sha, message } of items) {
    const problems = lintMessage(message);
    if (!problems.length) continue;
    bad++;
    console.error(`${sha.slice(0, 12)}: ${cleanMessage(message).split('\n')[0]}`);
    for (const p of problems) console.error(`  - ${p}`);
  }
  if (bad) {
    console.error(`commit messages: ${bad} of ${items.length} do not follow Conventional Commits in English`);
    console.error('  e.g. "feat(web): the update prompt names the new version", "fix(server): …", "docs: …"');
    return 1;
  }
  console.log(`commit messages: ${items.length} ok`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
