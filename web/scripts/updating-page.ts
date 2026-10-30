import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATALOGS, LANGUAGES, SOURCE_LANGUAGE } from '@marksy/i18n';

// `pnpm --filter @marksy/web updating-page`: writes docker/web/updating.html, the page the reverse proxy shows when the
// server or the web app has not come back within 30 seconds of a restart (docs/running.md, updates). It has no script
// and nothing from elsewhere: the key app.updating in every interface language, and a refresh every 10 seconds.
// A test fails when the file is older than the translations.

export const UPDATING_HTML = fileURLToPath(new URL('../../docker/web/updating.html', import.meta.url));

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function updatingPage(): string {
  const codes = [SOURCE_LANGUAGE, ...LANGUAGES.map((l) => l.code).filter((c) => c !== SOURCE_LANGUAGE)];
  const lines = codes
    .filter((code) => CATALOGS[code]?.['app.updating'])
    .map((code) => `    <p lang="${code}">${escape(CATALOGS[code]!['app.updating']!)}</p>`);
  return [
    '<!doctype html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta http-equiv="refresh" content="10" />',
    '    <title>Marksy</title>',
    '  </head>',
    '  <body>',
    ...lines,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(UPDATING_HTML, updatingPage());
  console.log('docker/web/updating.html written');
}
