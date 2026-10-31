import { describe, expect, it } from 'vitest';
import {
  codeBlocks,
  forbiddenProblems,
  frenchSpaces,
  header,
  ISSUE_FORM,
  languageBar,
  parseHeader,
  readLanguages,
  sourceHash,
  statusPage,
  translationProblems,
} from './docs-check.mjs';

const languages = [
  ['en', 'English', 'English'],
  ['de', 'German', 'Deutsch'],
  ['fr', 'French', 'Français'],
];
const fence = '```';
const source = [
  languageBar(languages, 'en'),
  '',
  '# Marksy',
  '',
  'Run it: [the guide](docs/running.md).',
  '',
  fence + 'sh',
  'pnpm install',
  fence,
  '',
].join('\n');
const note = `> Maschinell übersetzt; Korrekturen: https://github.com/Dopetast1c/Marksy/${ISSUE_FORM}`;

function translation(overrides = {}) {
  const o = {
    stamp: header(sourceHash(source), 'machine'),
    bar: languageBar(languages, 'de'),
    note,
    body: ['# Marksy', '', 'Starten: [die Anleitung](docs/running.md).', '', fence + 'sh', 'pnpm install', fence, ''],
    ...overrides,
  };
  return [o.stamp, o.bar, '', o.note, '', ...o.body].join('\n');
}

const run = (text) =>
  translationProblems({
    lang: 'de',
    text,
    sourceText: source,
    languages,
    exists: (p) => ['docs/running.md', 'README.fr.md'].includes(p),
  });

describe('docs check', () => {
  it('reads the twelve languages, English first', () => {
    const all = readLanguages();
    expect(all).toHaveLength(12);
    expect(all[0]).toEqual(['en', 'English', 'English']);
    expect(all.map(([c]) => c)).toContain('kk');
  });

  it('the bar names every language, the current one in bold', () => {
    expect(languageBar(languages, 'de')).toBe('[English](README.md) · **Deutsch** · [Français](README.fr.md)');
  });

  it('the hash follows the English text, not its bar', () => {
    const otherBar = source.replace(languageBar(languages, 'en'), languageBar(languages.slice(0, 2), 'en'));
    expect(sourceHash(otherBar)).toBe(sourceHash(source));
    expect(sourceHash(source.replace('Run it', 'Start it'))).not.toBe(sourceHash(source));
    expect(sourceHash(source.replace(/\n/g, '\r\n'))).toBe(sourceHash(source));
  });

  it('a good translation passes', () => {
    expect(run(translation())).toEqual({ errors: [], warnings: [] });
    expect(parseHeader(translation())).toEqual({ page: 'README.md', hash: sourceHash(source), status: 'machine' });
  });

  it('a changed English text makes it stale: a warning', () => {
    const r = run(translation({ stamp: header('0123456789ab', 'machine') }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.why)).toEqual([expect.stringContaining('stale')]);
  });

  it('refuses a wrong stamp, bar or note', () => {
    expect(run(translation({ stamp: '# Marksy' })).errors[0]?.why).toContain('source stamp');
    expect(run(translation({ stamp: header(sourceHash(source), 'perfect') })).errors[0]?.why).toContain('status');
    expect(run(translation({ bar: languageBar(languages, 'en') })).errors[0]?.why).toContain('language bar');
    expect(run(translation({ note: '> Maschinell übersetzt.' })).errors[0]?.why).toContain(ISSUE_FORM);
  });

  it('code is never translated', () => {
    const body = ['# Marksy', '', fence + 'sh', 'pnpm installieren', fence, ''];
    expect(run(translation({ body })).errors.map((e) => e.why)).toEqual([
      expect.stringContaining('code block 1 differs'),
    ]);
    expect(codeBlocks(source)).toEqual(['pnpm install']);
  });

  it('links must exist, and never lead to another language', () => {
    const body = [
      '# Marksy',
      '',
      '[x](docs/gone.md) [y](README.fr.md) [z](#marksy) [w](https://example.com)',
      '',
      fence + 'sh',
      'pnpm install',
      fence,
      '',
    ];
    expect(run(translation({ body })).errors.map((e) => e.why)).toEqual([
      'link to docs/gone.md, which does not exist',
      expect.stringContaining('another language'),
    ]);
  });

  it('names no country and no diary host, in any language; the language may be named', () => {
    const bad = [
      'Made in Belarus.',
      // the first provider's host, put together so that the privacy check does not see it in a test
      ['diary.e', 'schools.by'].join('-'),
      'Schulen in Weißrussland',
      'en Bielorrusia',
      'у Беларусі',
      'в Беларуси',
      'в Минске',
      // Ukrainian: in Belarus, Belarus
      'в Білорусі',
      'Білорусь.',
    ];
    for (const line of bad) expect(forbiddenProblems('README.md', line), line).toHaveLength(1);
    const fine = [
      'Belarusian, Ukrainian and Kazakh',
      'беларуский язык',
      '[Беларуская](README.be.md)',
      'followed by a backup',
      // the language in Romanian; its last letter is not ASCII
      'rusă, belarusă, ucraineană',
      // the language in Ukrainian and in Belarusian
      'білоруська мова',
      'беларуская мова',
    ];
    for (const line of fine) expect(forbiddenProblems('README.md', line), line).toEqual([]);
  });

  it('French: no-break spaces in prose, never in code or a link target', () => {
    const nb = ' ';
    const text = [
      '<!-- source: README.md sha256:000000000000 · machine -->',
      'Les **notes** : un tableau ; vraiment ? Oui ! Comme « Contrôle ».',
      'Lancez `pnpm a : b` puis [le guide](docs/x.md?a=1) : fini.',
      fence + 'sh',
      'echo "a : b"',
      fence,
    ].join('\n');
    const out = frenchSpaces(text).split('\n');
    expect(out[1]).toBe(`Les **notes**${nb}: un tableau${nb}; vraiment${nb}? Oui${nb}! Comme «${nb}Contrôle${nb}».`);
    expect(out[2]).toBe(`Lancez \`pnpm a : b\` puis [le guide](docs/x.md?a=1)${nb}: fini.`);
    expect(out[4]).toBe('echo "a : b"');
    expect(frenchSpaces(frenchSpaces(text))).toBe(frenchSpaces(text));
  });

  it('the status page lists every translation with its status', () => {
    const page = statusPage(languages, { de: { status: 'machine' } });
    expect(page).toContain('| German | `de` | [README.de.md](../README.de.md) | machine |');
    expect(page).toContain('| French | `fr` | missing | - |');
    expect(page).not.toContain('| English |');
  });
});
