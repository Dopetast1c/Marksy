import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_EYES, AVATAR_HAIR, AVATAR_SKIN, avatarOf } from './avatar';

describe('avatar', () => {
  it('the trait colours are the keys of docs/tokens.json → avatar', () => {
    const tokens = JSON.parse(readFileSync(new URL('../../../docs/tokens.json', import.meta.url), 'utf8'));
    expect([...AVATAR_SKIN]).toEqual(Object.keys(tokens.avatar.skin));
    expect([...AVATAR_HAIR]).toEqual(Object.keys(tokens.avatar.hair));
    expect([...AVATAR_EYES]).toEqual(Object.keys(tokens.avatar.eyes));
  });

  it('a photo is served by the child’s route with a version, never by its storage key', () => {
    const out = avatarOf({ kind: 'photo', key: 'a1b2.jpg', mime: 'image/jpeg', bytes: 10 }, 'kid-1');
    expect(out).toEqual({
      kind: 'photo',
      url: expect.stringMatching(/^\/api\/students\/kid-1\/photo\?v=[0-9a-f]{12}$/),
    });
    expect(JSON.stringify(out)).not.toContain('a1b2');
    expect(avatarOf({ kind: 'traits', traits: { age: 'x' } }, 'kid-1')).toBeNull();
    expect(avatarOf(null, 'kid-1')).toBeNull();
  });
});
