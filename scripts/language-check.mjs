#!/usr/bin/env node
// `pnpm language` (also part of `pnpm privacy`): English everywhere in the repository, except where another language is
// the content itself (CLAUDE.md, "Language"). Cyrillic is allowed only in:
// - the app's locale files (packages/i18n/src/locales/);
// - the translated README (README.<lang>.md), and the language bar on the first line of README.md (languages by their own
//   names, exactly as scripts/docs-check.mjs writes it);
// - the clickable prototype (docs/mockups.html);
// - the seed, the demo diary and the diaries' sanitised fixtures and test data, as data: string literals in code,
//   anything in a data file; never in a comment;
// - test files, as data in string literals (names, subjects, or a test about Russian itself), never in a comment;
// - the four development specs (design, ux-principles, api-spec, build-plan), as UI copy and diary text quoted in
//   English prose: outside «…», "…", `…` and **…** (a UI label in bold), four Cyrillic words in a row are Russian
//   prose and fail.
// Generated from the locale files and therefore allowed whole: the proxy's page while the app restarts. The providers'
// manifests carry their own localised names and field labels; their code may match the diary's own text in string
// literals (never in comments). Language names in their own language and the month names of the short date format are
// data too.
// Everything else, code comments, identifiers and the other docs included, is English. Prints file:line and the
// reason, never the text.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { languageBar, readLanguages, SOURCE } from './docs-check.mjs';

// U+0400 to U+04FF, written as escapes so this file stays English itself
const CYRILLIC = new RegExp('[\\u0400-\\u04FF]');
const CYRILLIC_G = new RegExp('[\\u0400-\\u04FF]', 'g');
const RUSSIAN_PROSE = new RegExp('[\\u0400-\\u04FF]+(?:\\s+[\\u0400-\\u04FF]+){3,}');

/** Files whose every character may be Cyrillic */
const WHOLE = [
  /^packages\/i18n\/src\/locales\//,
  /^README\.(?!md$)[a-z]{2,3}\.md$/,
  /^docs\/mockups\.html$/,
  // data files of the seed, the demo diary and the diaries' fixtures
  /^providers\/[^/]+\/fixtures\//,
  /^providers\/[^/]+\/src\/testdata\//,
  /^packages\/demo-diary\/.*\.json$/,
  /^providers\/[^/]+\/provider\.json$/,
  /^docker\/web\/updating\.html$/,
];

/** Code whose string literals may hold Cyrillic data (comments never) */
const DATA_CODE = [
  /^server\/src\/seed\//,
  /^packages\/demo-diary\/src\//,
  /^web\/src\/test\//,
  /\.test\.(ts|tsx|mjs|js)$/,
  /^providers\/[^/]+\/src\//,
  /^packages\/i18n\/src\/languages\.ts$/,
  /^packages\/core\/src\/marks\/short-dates\.ts$/,
];

/** The development specs that may quote UI copy and diary text */
const QUOTING = new Set(['docs/design.md', 'docs/ux-principles.md', 'docs/api-spec.md', 'docs/build-plan.md']);

const CODE = /\.(ts|tsx|mjs|cjs|js)$/;

/** Ranges [start, end) of every string, template and JSX text in a source file */
function literalRanges(path, text) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node) ||
      node.kind === ts.SyntaxKind.RegularExpressionLiteral
    )
      ranges.push([node.getStart(source), node.getEnd()]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ranges;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Problems of one file: [line, reason] */
export function checkText(path, text) {
  if (!CYRILLIC.test(text)) return [];
  if (WHOLE.some((re) => re.test(path))) return [];
  const problems = [];
  if (CODE.test(path)) {
    const ranges = literalRanges(path, text);
    const data = DATA_CODE.some((re) => re.test(path));
    const seen = new Set();
    for (const m of text.matchAll(CYRILLIC_G)) {
      const inLiteral = ranges.some(([s, e]) => m.index >= s && m.index < e);
      if (inLiteral && data) continue;
      const line = lineOf(text, m.index);
      if (seen.has(line)) continue;
      seen.add(line);
      problems.push([
        line,
        inLiteral
          ? 'Cyrillic text in code: an i18n key, or English'
          : 'Cyrillic in a comment or a name: English, with the i18n key',
      ]);
    }
    return problems;
  }
  if (QUOTING.has(path)) {
    // UI words and diary text inside English prose are fine; a line that is mostly Cyrillic is Russian prose
    text.split('\n').forEach((line, i) => {
      const bare = line
        .replace(/«[^»]*»/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/"[^"]*"/g, '')
        .replace(/\*\*[^*]*\*\*/g, '');
      // a screen's name or a label is a word or three; four Cyrillic words in a row, with nothing but spaces between
      // them, are a Russian sentence
      if (RUSSIAN_PROSE.test(bare))
        problems.push([i + 1, 'Russian prose in a development spec: English, quoting the UI']);
    });
    return problems;
  }
  const bar = path === SOURCE ? languageBar(readLanguages(), 'en') : null;
  text.split('\n').forEach((line, i) => {
    if (i === 0 && line.replace(/\r$/, '') === bar) return;
    if (CYRILLIC.test(line)) problems.push([i + 1, 'Cyrillic in a file that must be English']);
  });
  return problems;
}

/** Cyrillic in a commit message: none at all */
export const messageProblems = (message) => (CYRILLIC.test(message) ? ['the message is not English'] : []);

function trackedFiles() {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean);
}

const TEXT =
  /\.(ts|tsx|mjs|cjs|js|json|md|ya?ml|html|css|txt|sh|ps1|example|caddy|Caddyfile)$|(^|\/)(Dockerfile|\.[a-z]+ignore|\.gitattributes)$/;

function main(args) {
  // --summary: one line per file with its count, for a large clean-up
  const summary = args.includes('--summary');
  const given = args.filter((a) => !a.startsWith('--'));
  const files = given.length ? given : trackedFiles();
  let count = 0;
  for (const path of files.filter((f) => TEXT.test(f))) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const problems = checkText(path, text);
    if (summary && problems.length) console.log(`${String(problems.length).padStart(4)} ${path}`);
    else for (const [line, why] of problems) console.log(`${path}:${line}: ${why}`);
    count += problems.length;
  }
  console.log(count ? `language check: ${count} problem(s)` : 'language check: ok');
  return count ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
