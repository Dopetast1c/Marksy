// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UPDATING_HTML, updatingPage } from './updating-page';

describe('the proxy page while Marksy restarts', () => {
  it('docker/web/updating.html is generated from the current translations', () => {
    expect(readFileSync(UPDATING_HTML, 'utf8')).toBe(updatingPage());
  });

  it('every interface language, English first; no script and nothing from elsewhere', () => {
    const html = updatingPage();
    expect(html.match(/<p lang=/g)).toHaveLength(12);
    expect(html.indexOf('lang="en"')).toBeLessThan(html.indexOf('lang="ru"'));
    expect(html).not.toMatch(/<script|https?:\/\//);
  });
});
