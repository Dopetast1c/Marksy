import { shortDate, shortRange } from '@marksy/core';
import { LANGUAGES } from '@marksy/i18n';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dateStyle, i18n, initI18n } from '../i18n';
import { formatTime, minutesIn, todayIn } from './time';

const deviceTz = process.env.TZ;
beforeAll(() => {
  initI18n('en');
});
afterEach(async () => {
  process.env.TZ = deviceTz;
  await i18n.changeLanguage('en');
});

describe('school time, not the device', () => {
  // 23:30 in Minsk on Monday 19 Oct is still Monday at the school, whatever the phone thinks
  const at = new Date('2026-10-19T20:30:00Z');

  it('the same day and minute whatever the device timezone', () => {
    for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = tz;
      expect(todayIn('Europe/Minsk', at)).toBe('2026-10-19');
      expect(minutesIn('Europe/Minsk', at)).toBe(23 * 60 + 30);
      expect(formatTime(at, 'Europe/Minsk', 'en-GB')).toBe('23:30');
    }
  });

  it('a calendar day keeps its date in every device timezone', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz;
      expect(shortDate('2026-10-19', dateStyle(), { weekday: true })).toBe('Mon, 19 Oct');
    }
  });
});

describe('short dates in the interface language', () => {
  // about Russian on purpose: the ru catalog's own month names, against English
  it('Russian and English from their catalogs, without a dot', async () => {
    await i18n.changeLanguage('ru');
    expect(shortRange('2026-10-12', '2026-10-18', dateStyle())).toBe('12–18 окт');
    expect(shortRange('2026-11-01', '2026-11-08', dateStyle())).toBe('1–8 ноя');
    await i18n.changeLanguage('en');
    expect(shortRange('2026-10-12', '2026-10-18', dateStyle())).toBe('12–18 Oct');
  });

  it('every language writes its own month names, never English ones, and never with a dot', async () => {
    for (const l of LANGUAGES.filter((x) => x.code !== 'en')) {
      await i18n.changeLanguage(l.code);
      expect(dateStyle().months, l.code).toHaveLength(12);
      const date = shortDate('2026-10-15', dateStyle());
      expect(date, l.code).not.toContain('Oct');
      expect(date, l.code).not.toContain('.');
    }
  });
});
