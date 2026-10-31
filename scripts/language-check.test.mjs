import { describe, expect, it } from 'vitest';
import { languageBar, readLanguages } from './docs-check.mjs';
import { checkText, messageProblems } from './language-check.mjs';

// Fictional Russian words, put together from escapes so this file follows its own rule
const ru = (s) => s;
const NAME = ru('Милена');
const WORD = ru('Главная');
const SENTENCE = ru('это целое русское предложение');

describe('language check', () => {
  it('code: never in a comment; in a string only where it is data', () => {
    expect(checkText('server/src/routes/x.ts', `// opens ${WORD}\nconst a = 1;\n`)).toEqual([
      [1, expect.stringMatching(/comment/)],
    ]);
    expect(checkText('server/src/routes/x.ts', `const a = '${WORD}';\n`)).toEqual([[1, expect.stringMatching(/code/)]]);
    expect(checkText('server/src/seed/seed.ts', `const name = '${NAME}';\n`)).toEqual([]);
    expect(checkText('web/src/features/a.test.tsx', `expect(screen.getByText('${NAME}'));\n`)).toEqual([]);
    expect(checkText('web/src/features/a.test.tsx', `// ${NAME} has two marks\n`)).toHaveLength(1);
    expect(checkText('providers/some-diary/src/map.ts', `if (cell === '${WORD}') x();\n`)).toEqual([]);
  });

  it('whole files that are a language themselves', () => {
    for (const path of [
      'packages/i18n/src/locales/ru.json',
      'README.ru.md',
      'docs/mockups.html',
      'providers/demo-full/fixtures/profile.json',
    ])
      expect(checkText(path, SENTENCE), path).toEqual([]);
    expect(checkText('README.md', SENTENCE)).toHaveLength(1);
    expect(checkText('docs/running.md', SENTENCE)).toHaveLength(1);
    // only the README is translated
    expect(checkText('docs/be/running.md', SENTENCE)).toHaveLength(1);
  });

  it('README.md: the language bar on the first line, and nowhere else', () => {
    const bar = languageBar(readLanguages(), 'en');
    expect(checkText('README.md', `${bar}\n\n# Marksy\n`)).toEqual([]);
    expect(checkText('README.md', `# Marksy\n\n${bar}\n`)).toEqual([[3, expect.any(String)]]);
    expect(checkText('docs/running.md', `${bar}\n`)).toHaveLength(1);
  });

  it('the four specs: UI words in English prose pass, a Russian sentence fails', () => {
    expect(checkText('docs/design.md', `The ${WORD} screen shows «${SENTENCE}» under **${SENTENCE}**.\n`)).toEqual([]);
    expect(checkText('docs/design.md', `| M5a | Web: ${WORD}, ${NAME} |\n`)).toEqual([]);
    expect(checkText('docs/design.md', `Notes: ${SENTENCE}.\n`)).toHaveLength(1);
  });

  it('commit messages are English', () => {
    expect(messageProblems('feat(web): the update prompt')).toEqual([]);
    expect(messageProblems(`fix: ${WORD}`)).toHaveLength(1);
  });
});
