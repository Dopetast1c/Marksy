#!/usr/bin/env node
// `pnpm docs:check [--strict]` and `pnpm docs:stamp <lang|all> [--status machine|reviewed]` (docs/i18n.md 7).
// The README is the one public page translated into every interface language (README.<lang>.md); every other page is
// English only. A translation starts with
//   <!-- source: README.md sha256:<12 hex> · machine -->   the hash of the English text it was made from, and its status
//   <the language bar>                                     the same line on every version, the current language in bold
//   (blank)
//   > <a note, in that language, with the link to the docs-translation issue form>
// Errors, always: a header, bar or note that is wrong; a fenced code block that differs from the English one; a
// relative link to a file that does not exist, or to another language's README; a translation of a language Marksy
// does not have; a country or diary host named in any public page; docs/locales-status.md not matching the headers.
// Warnings, errors with --strict (before every merge into main and in the release workflow): a missing translation,
// and a stale one (the English text changed since its hash). Prints file:line and the reason.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SOURCE = 'README.md';
/** Public pages in English only: checked for the forbidden names, never translated */
export const ENGLISH_ONLY = ['docs/running.md', 'docs/adding-a-diary.md'];
export const STATUS_FILE = 'docs/locales-status.md';
export const ISSUE_FORM = 'issues/new?template=docs-translation.yml';
const STATUSES = ['machine', 'reviewed'];

/**
 * The languages, English first, then the order of packages/i18n/src/languages.ts: [code, English name, native name]
 */
export function readLanguages(text = readFileSync(join(ROOT, 'packages/i18n/src/languages.ts'), 'utf8')) {
  const all = [...text.matchAll(/code:\s*'([a-z]+)',\s*name:\s*'([^']+)',\s*nativeName:\s*'([^']+)'/g)].map((m) =>
    m.slice(1, 4),
  );
  return [...all.filter(([c]) => c === 'en'), ...all.filter(([c]) => c !== 'en')];
}

export const pageOf = (lang) => (lang === 'en' ? SOURCE : `README.${lang}.md`);

/** The language bar of one version: every language by its own name, the current one in bold */
export const languageBar = (languages, current) =>
  languages
    .map(([code, , native]) => (code === current ? `**${native}**` : `[${native}](${pageOf(code)})`))
    .join(' · ');

const lf = (text) => text.replace(/\r\n/g, '\n');

/** The English text a translation follows: the source without its language bar */
export function sourceHash(sourceText) {
  const body = lf(sourceText).split('\n');
  if (body[0]?.startsWith('**') && body[0].includes(' · ')) body.splice(0, 2);
  return createHash('sha256').update(body.join('\n')).digest('hex').slice(0, 12);
}

const HEADER = /^<!-- source: (\S+) sha256:([0-9a-f]{12}) · (\w+) -->$/;
export const header = (hash, status) => `<!-- source: ${SOURCE} sha256:${hash} · ${status} -->`;

export function parseHeader(text) {
  const m = lf(text).split('\n')[0]?.match(HEADER);
  return m ? { page: m[1], hash: m[2], status: m[3] } : null;
}

/** Fenced code blocks, in order */
export function codeBlocks(text) {
  const blocks = [];
  let open = null;
  for (const line of lf(text).split('\n')) {
    if (/^\s*```/.test(line)) {
      if (open === null) open = [];
      else {
        blocks.push(open.join('\n'));
        open = null;
      }
    } else if (open) open.push(line);
  }
  return blocks;
}

// A country or diary host named in public copy (CLAUDE.md, "Public-facing copy"), in every language of the
// documentation. The country's name, never the language's: the Belarusian language is one of the twelve. Cyrillic is
// written as escapes in strings (a formatter keeps those, not the ones in a regular expression literal), so that this
// file stays English.
const FORBIDDEN = [
  'e-?schools',
  '\\bbelarus\\b',
  '\\bminsk\\b',
  '\\bbia\\u0142oru(\\u015b|si\\b)',
  '\\bbielorr?[u\\u00fa]ss?ia\\b',
  '\\bbi[e\\u00e9]lorussie\\b',
  '\\bwei(\\u00df|ss)russland\\b',
  '\\bwit-?rusland\\b',
  // Belarus (be, ru, kk, its cases), the older Russian name, the Ukrainian name, Minsk
  '\\u0431\\u0435\\u043b\\u0430\\u0440\\u0443\\u0441[\\u044c\\u0438\\u0456]',
  '\\u0431\\u0435\\u043b\\u043e\\u0440\\u0443\\u0441\\u0441',
  '\\u0431\\u0456\\u043b\\u043e\\u0440\\u0443\\u0441[\\u044c\\u0456]',
  '\\u043c[\\u0438\\u0456]\\u043d\\u0441\\u043a',
  '[a-z0-9-]+\\.by(/|\\b)',
].map((source) => new RegExp(source, 'iu'));

export function forbiddenProblems(path, text) {
  const problems = [];
  lf(text)
    .split('\n')
    .forEach((line, i) => {
      if (FORBIDDEN.some((re) => re.test(line)))
        problems.push({ path, line: i + 1, why: 'names a country or a diary host: public copy names neither' });
    });
  return problems;
}

/** Relative links of a Markdown text with their line: [line, target] */
function links(text) {
  const out = [];
  lf(text)
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) out.push([i + 1, m[1]]);
    });
  return out;
}

/**
 * Problems of one translation: errors and warnings, each { path, line, why }
 * @param {{ lang: string, text: string, sourceText: string, languages: string[][], exists: (p: string) => boolean }} a
 */
export function translationProblems({ lang, text, sourceText, languages, exists }) {
  const path = pageOf(lang);
  const errors = [];
  const warnings = [];
  const lines = lf(text).split('\n');
  const err = (line, why) => errors.push({ path, line, why });
  const h = parseHeader(text);
  if (!h) err(1, `the first line is not the source stamp: ${header('<hash>', 'machine')}`);
  else {
    if (h.page !== SOURCE) err(1, `the stamp names ${h.page}, not ${SOURCE}`);
    if (!STATUSES.includes(h.status)) err(1, `status ${h.status}: ${STATUSES.join(' or ')}`);
    if (h.hash !== sourceHash(sourceText))
      warnings.push({
        path,
        line: 1,
        why: `stale: ${SOURCE} changed since; translate the change, then pnpm docs:stamp ${lang}`,
      });
  }
  if (lines[1] !== languageBar(languages, lang)) err(2, 'the second line is not the language bar');
  if (lines[2] !== '') err(3, 'a blank line after the language bar');
  if (!lines[3]?.startsWith('> ') || !lines[3].includes(ISSUE_FORM))
    err(4, `the fourth line is the note on the machine translation, a quote with the link to ${ISSUE_FORM}`);
  const mine = codeBlocks(text);
  const theirs = codeBlocks(sourceText);
  if (mine.length !== theirs.length) err(1, `${mine.length} code blocks, the English page has ${theirs.length}`);
  else
    mine.forEach((block, i) => {
      if (block !== theirs[i]) err(1, `code block ${i + 1} differs from the English one: code is never translated`);
    });
  for (const [line, target] of links(text)) {
    if (line === 2 || /^(https?:|mailto:|#)/.test(target)) continue;
    const file = target.split('#')[0];
    if (!exists(posix.normalize(file))) err(line, `link to ${file}, which does not exist`);
    else if (/^README(\.[a-z]+)?\.md$/.test(file) && file !== path)
      err(line, `link to ${file}: another language's README; link this one's sections or the English pages`);
  }
  errors.push(...forbiddenProblems(path, text));
  return { errors, warnings };
}

/** docs/locales-status.md from the translations' stamps */
export function statusPage(languages, stamps) {
  const rows = languages
    .filter(([code]) => code !== 'en')
    .map(([code, name]) => {
      const s = stamps[code];
      return `| ${name} | \`${code}\` | ${s ? `[README.${code}.md](../README.${code}.md)` : 'missing'} | ${s?.status ?? '-'} |`;
    });
  return [
    '# Translations of the README',
    '',
    'The README is the one page of the documentation translated into every interface language; the other pages are in English (`docs/i18n.md` 7). `machine` means a careful machine translation from the English text, `reviewed` that a speaker of the language has checked it. Corrections are welcome through the issue form *Documentation translation*.',
    '',
    'Written by `pnpm docs:stamp`; `pnpm docs:check` fails when it does not match the translations.',
    '',
    '| Language | Code | Page | Status |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function stampsOf(languages) {
  const stamps = {};
  for (const [code] of languages) {
    if (code === 'en') continue;
    const text = read(pageOf(code));
    const h = text && parseHeader(text);
    if (h) stamps[code] = h;
  }
  return stamps;
}

function check(strict) {
  const languages = readLanguages();
  const codes = new Set(languages.map(([c]) => c));
  const sourceText = read(SOURCE) ?? '';
  const exists = (rel) => existsSync(join(ROOT, rel));
  const errors = [];
  const warnings = [];
  if (lf(sourceText).split('\n')[0] !== languageBar(languages, 'en'))
    errors.push({ path: SOURCE, line: 1, why: 'the first line is not the language bar' });
  errors.push(...forbiddenProblems(SOURCE, sourceText));
  for (const page of ENGLISH_ONLY) errors.push(...forbiddenProblems(page, read(page) ?? ''));
  for (const f of readdirSync(ROOT)) {
    const m = f.match(/^README\.([a-z]+)\.md$/);
    if (m && !codes.has(m[1])) errors.push({ path: f, line: 1, why: `${m[1]} is not an interface language` });
  }
  for (const [lang] of languages) {
    if (lang === 'en') continue;
    const text = read(pageOf(lang));
    if (text === null) {
      warnings.push({ path: pageOf(lang), line: 0, why: 'missing: translate README.md' });
      continue;
    }
    const r = translationProblems({ lang, text, sourceText, languages, exists });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  if (lf(read(STATUS_FILE) ?? '') !== statusPage(languages, stampsOf(languages)))
    errors.push({ path: STATUS_FILE, line: 1, why: 'does not match the translations: pnpm docs:stamp writes it' });
  const show = (p, kind) => console.log(`${p.path}${p.line ? `:${p.line}` : ''}: ${kind}${p.why}`);
  for (const p of errors) show(p, '');
  for (const p of warnings) show(p, strict ? '' : 'warning: ');
  const failed = errors.length + (strict ? warnings.length : 0);
  console.log(
    failed
      ? `docs check: ${failed} problem(s)`
      : `docs check: ok${warnings.length ? ` (${warnings.length} warning(s); --strict before a merge into main)` : ''}`,
  );
  return failed ? 1 : 0;
}

function stamp(args) {
  const languages = readLanguages();
  const which = args.find((a) => !a.startsWith('--'));
  const i = args.indexOf('--status');
  const status = i >= 0 ? args[i + 1] : null;
  if (!which || (status && !STATUSES.includes(status))) {
    console.error(`pnpm docs:stamp <lang|all> [--status ${STATUSES.join('|')}]`);
    return 2;
  }
  const hash = sourceHash(read(SOURCE) ?? '');
  const targets = which === 'all' ? languages.map(([c]) => c).filter((c) => c !== 'en') : [which];
  for (const lang of targets) {
    const file = pageOf(lang);
    const text = read(file);
    if (lang === 'en' || !languages.some(([c]) => c === lang) || text === null) {
      console.error(`${file}: no translation to stamp`);
      return 2;
    }
    const lines = lf(text).split('\n');
    const old = parseHeader(text);
    const line = header(hash, status ?? old?.status ?? 'machine');
    if (old) lines[0] = line;
    else lines.unshift(line);
    writeFileSync(join(ROOT, file), lines.join('\n'));
    console.log(`${file}: ${line}`);
  }
  writeFileSync(join(ROOT, STATUS_FILE), statusPage(languages, stampsOf(languages)));
  console.log(`${STATUS_FILE}: written`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...rest] = process.argv.slice(2);
  process.exitCode = command === 'stamp' ? stamp(rest) : check(process.argv.includes('--strict'));
}
