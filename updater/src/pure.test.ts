import { describe, expect, it } from 'vitest';
import { parseChannel, parseVersion, pickRelease } from './channel';
import { createNudgeChecker, signature } from './hook';
import { inQuietHours, parseQuietHours } from './quiet';

const TAGS = ['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0', 'sha-abc', 'edge', 'stable', '1', '1.1'];

describe('channels', () => {
  it('"1" takes 1.1.0 and 1.1.1 but never 2.0.0', () => {
    expect(pickRelease(parseChannel('1'), parseVersion('1.0.0'), ['1.0.0', '1.1.0'])).toEqual([1, 1, 0]);
    expect(pickRelease(parseChannel('1'), parseVersion('1.1.0'), ['1.1.0', '1.1.1', '2.0.0'])).toEqual([1, 1, 1]);
    expect(pickRelease(parseChannel('1'), parseVersion('1.2.0'), TAGS)).toBeNull();
  });

  it('"1.1" takes 1.1.1 but not 1.2.0', () => {
    expect(pickRelease(parseChannel('1.1'), parseVersion('1.1.0'), TAGS)).toEqual([1, 1, 1]);
    expect(pickRelease(parseChannel('1.1'), parseVersion('1.1.1'), TAGS)).toBeNull();
  });

  it('a pinned version never updates; stable takes a new major; nothing lower than the running one', () => {
    expect(pickRelease(parseChannel('1.1.0'), parseVersion('1.0.0'), TAGS)).toBeNull();
    expect(pickRelease(parseChannel('stable'), parseVersion('1.2.0'), TAGS)).toEqual([2, 0, 0]);
    expect(pickRelease(parseChannel('1'), parseVersion('1.3.0'), TAGS)).toBeNull();
    expect(pickRelease(parseChannel(''), null, TAGS)).toEqual([1, 2, 0]);
  });

  it('edge and preview are digest channels; anything else is refused', () => {
    expect(parseChannel('edge')).toEqual({ kind: 'digest', tag: 'edge' });
    expect(pickRelease(parseChannel('edge'), parseVersion('1.0.0'), TAGS)).toBeNull();
    expect(() => parseChannel('latest')).toThrow();
  });
});

describe('the update hook', () => {
  const secret = 'x'.repeat(64);
  const at = 1_800_000_000;
  const signed = (ts: number, body = '{}') => ({
    timestamp: String(ts),
    signature: signature(secret, String(ts), body),
  });

  it('accepts a signed, fresh nudge once', () => {
    const check = createNudgeChecker(secret, { now: () => at * 1000 });
    const nudge = signed(at);
    expect(check(nudge, '{}')).toBe('ok');
    expect(check(nudge, '{}')).toBe('replayed');
  });

  it('refuses an unsigned, a wrongly signed, a changed body and a stale nudge', () => {
    const check = createNudgeChecker(secret, { now: () => at * 1000 });
    expect(check({}, '{}')).toBe('unsigned');
    expect(check({ timestamp: String(at), signature: signature('other', String(at), '{}') }, '{}')).toBe(
      'bad_signature',
    );
    expect(check(signed(at), '{"version":"9.9.9"}')).toBe('bad_signature');
    expect(check(signed(at - 600), '{}')).toBe('stale');
    expect(check(signed(at + 600), '{}')).toBe('stale');
  });

  it('a few a minute at most', () => {
    let t = at * 1000;
    const check = createNudgeChecker(secret, { now: () => t, perMinute: 2 });
    expect(check(signed(at, 'a'), 'a')).toBe('ok');
    expect(check(signed(at, 'b'), 'b')).toBe('ok');
    expect(check(signed(at, 'c'), 'c')).toBe('too_many');
    t += 61_000;
    expect(check(signed(at + 61, 'd'), 'd')).toBe('ok');
  });
});

describe('quiet hours', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m);

  it('none by default; across midnight; within a day', () => {
    expect(inQuietHours(parseQuietHours(''), at(3))).toBe(false);
    const night = parseQuietHours('22:00-07:00');
    expect(inQuietHours(night, at(23))).toBe(true);
    expect(inQuietHours(night, at(6, 59))).toBe(true);
    expect(inQuietHours(night, at(7))).toBe(false);
    const lunch = parseQuietHours('12:00-13:00');
    expect(inQuietHours(lunch, at(12, 30))).toBe(true);
    expect(inQuietHours(lunch, at(13, 30))).toBe(false);
    expect(() => parseQuietHours('7-8')).toThrow();
  });
});
