import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Lint rules carry a few of the codebase invariants from CLAUDE.md so they are caught before review.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'data/**', 'docs/**', 'Claude outputs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          // Calendar conventions come from the provider manifest or the locale (CLAUDE.md, "Provider boundary")
          selector:
            "BinaryExpression[left.type='CallExpression'][left.callee.property.name='getDay'][right.type='Literal']",
          message: 'Weekday checks come from the provider manifest or the locale, not getDay() === N.',
        },
      ],
    },
  },
  {
    // Providers call the diary only through ctx.http, the throttled client (docs/providers.md)
    files: ['providers/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use ctx.http, the throttled client.' }],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, i18next },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Colours come from docs/tokens.json through Tailwind; a hex value in a component is a bug (CLAUDE.md)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'No hex colours in components: use the token classes generated from docs/tokens.json.',
        },
        {
          // user-facing attributes are words too (docs/i18n.md 5)
          selector:
            'JSXAttribute[name.name=/^(aria-label|title|alt|placeholder)$/] > Literal[value=/[A-Za-z\\u0410-\\u044f\\u0401\\u0451]/]',
          message: 'User-facing attributes come from t(), never a literal string.',
        },
      ],
    },
  },
  {
    // One way to write a number of the scale (docs/i18n.md 2): web/src/lib/numbers.ts, bound to the child's scale and
    // the interface language; no toFixed, no core formatter called past it
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/lib/numbers.ts', 'web/src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@marksy/core',
              importNames: ['formatAverage', 'formatValue', 'formatFinal', 'formatBandRange'],
              message: 'Write numbers through web/src/lib/numbers.ts.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'toFixed', message: 'Write numbers through web/src/lib/numbers.ts.' },
      ],
    },
  },
  {
    // No literal user-facing strings in components (CLAUDE.md, docs/i18n.md 5): JSX text is a t() key
    files: ['web/src/**/*.tsx'],
    ignores: ['web/src/**/*.test.tsx'],
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] },
  },
);
