import { afterEach, describe, expect, it } from 'vitest';
import { i18n, initialLanguage, initI18n, languageOverride, setLanguage, setLanguageOverride } from './index';

// The development override (docs/i18n.md 5): smoke:ui --lang and the pseudo-locale show a language on this device
// without touching the user's saved one; picking a language ends it.

describe('language override in development', () => {
  afterEach(async () => {
    await setLanguage('ru');
  });

  it('wins over the device language and shows the pseudo-locale', async () => {
    initI18n('ru');
    localStorage.setItem('marksy.lang', 'en');
    await setLanguageOverride('qps');
    expect(languageOverride()).toBe('qps');
    expect(initialLanguage()).toBe('qps');
    expect(i18n.t('tabs.home')).toBe('[Ĥóɱé~~~~~]');
  });

  it('ignores an unknown code, and picking a language clears it', async () => {
    initI18n('ru');
    localStorage.setItem('marksy.lang.override', 'xx');
    expect(languageOverride()).toBeNull();
    await setLanguageOverride('de');
    await setLanguage('en');
    expect(languageOverride()).toBeNull();
    expect(i18n.language).toBe('en');
  });
});
