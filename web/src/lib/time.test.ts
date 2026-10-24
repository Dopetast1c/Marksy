import { afterEach, describe, expect, it } from 'vitest';
import { daysBetween, formatDay, formatTime, minutesIn, todayIn } from './time';

const deviceTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = deviceTz;
});

describe('school time, not the device', () => {
  // 23:30 in Minsk on Monday 19 Oct is still Monday at the school, whatever the phone thinks
  const at = new Date('2026-10-19T20:30:00Z');

  it('the same day and minute whatever the device timezone', () => {
    for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = tz;
      expect(todayIn('Europe/Minsk', at)).toBe('2026-10-19');
      expect(minutesIn('Europe/Minsk', at)).toBe(23 * 60 + 30);
      expect(formatTime(at, 'Europe/Minsk', 'ru-RU')).toBe('23:30');
    }
  });

  it('a calendar day keeps its date in every device timezone', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz;
      expect(formatDay('2026-10-19', 'en-GB', { weekday: undefined, month: 'long' })).toBe('19 October');
    }
    expect(daysBetween('2026-10-19', '2026-11-01')).toBe(13);
  });
});
