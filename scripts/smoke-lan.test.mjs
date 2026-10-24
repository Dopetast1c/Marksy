import { describe, expect, it } from 'vitest';
import { countsOf, lanAddress, ownAddresses, secretHits, sessionCookie, shapeOf } from './smoke-lan.mjs';

describe('smoke:lan', () => {
  it('finds the home-network address of a real adapter, never a virtual one or the loopback', () => {
    const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });
    expect(
      lanAddress({
        'vEthernet (WSL)': [v4('172.20.16.1')],
        'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
        'Wi-Fi': [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('192.168.1.20')],
        Tailscale: [v4('100.64.0.2')],
      }),
    ).toBe('192.168.1.20');
    expect(lanAddress({ 'vEthernet (WSL)': [v4('172.20.16.1')] })).toBe('172.20.16.1');
    expect(lanAddress({ lo: [v4('127.0.0.1', true)], link: [v4('169.254.10.1')] })).toBeNull();
    // --host is checked against this machine's own addresses
    expect(ownAddresses({ 'Wi-Fi': [v4('192.168.1.20')], lo: [v4('127.0.0.1', true)] })).toEqual([
      '192.168.1.20',
      '127.0.0.1',
    ]);
  });

  it('a shape shows keys and types, never a value', () => {
    const body = [{ id: 'x', name: 'Иванова Мария', grade: 7, school: { label: 'Гимназия' }, marks: [] }];
    const shape = shapeOf(body);
    expect(shape).toBe('[1× {id: string, name: string, grade: number, school: {label: string}, marks: []}]');
    expect(shape).not.toMatch(/Иванова|Гимназия/);
    expect(countsOf(body)).toBe('1 items');
    // a map keyed by data never shows its keys
    const keyed = shapeOf({ byStudent: { '00aa11bb-2222-4333-8444-555566667777': 1, Иванова: 2, w20261019: 3 } });
    expect(keyed).toBe('{byStudent: {<key>: number, <key>: number, <key>: number}}');
    expect(countsOf({ period: {}, subjects: [1, 2], events: [] })).toBe('subjects 2, events 0');
  });

  it('a password, the token or a secret-looking key in a response is a problem', () => {
    const secrets = { 'Marksy password': 'correct horse', 'session token': 'tok-abcdef' };
    expect(secretHits('{"user":{"login":"a@example.com"}}', secrets)).toEqual([]);
    expect(secretHits('{"note":"correct horse"}', secrets)).toEqual(['contains the Marksy password']);
    expect(secretHits('{"user":{"passwordHash":"x"}}', secrets)).toEqual(['key $.user.passwordHash']);
    expect(secretHits('{"a":[{"token":"tok-abcdef"}]}', secrets)).toEqual([
      'contains the session token',
      'key $.a[0].token',
    ]);
    // escaped by JSON, and keys that only contain a secret word
    expect(secretHits(JSON.stringify({ a: 'say "hi"\\' }), { password: 'say "hi"\\' })).toEqual([
      'contains the password',
    ]);
    expect(secretHits('{"x":{"diaryPassword":1,"accessToken":2,"credentialsEnc":3}}', {})).toEqual([
      'key $.x.diaryPassword',
      'key $.x.accessToken',
      'key $.x.credentialsEnc',
    ]);
    // an empty or very short secret never matches everything
    expect(secretHits('{"x":1}', { 'diary password': '' })).toEqual([]);
  });

  it('the session cookie must be HttpOnly, SameSite=Lax, lasting, and not Secure over http', () => {
    const good = 'marksy_session=abc; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax';
    expect(sessionCookie(['other=1', good])).toEqual({ token: 'abc', problems: [] });
    expect(sessionCookie([`${good}; Secure`]).problems).toEqual([
      'the session cookie is Secure: a browser never sends it back over http',
    ]);
    expect(sessionCookie(['marksy_session=abc; Path=/; SameSite=Strict']).problems).toEqual([
      'the session cookie is not HttpOnly',
      'the session cookie is not SameSite=Lax',
      'the session cookie ends with the browser',
    ]);
    expect(sessionCookie([]).problems).toEqual(['no session cookie was set']);
  });
});
