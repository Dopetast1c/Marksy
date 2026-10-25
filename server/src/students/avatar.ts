import { createHash } from 'node:crypto';
import { z } from 'zod';
import { registry } from '../openapi';

// A child's avatar (docs/design.md 5.6, ux-principles D9): drawn in the app from a few traits, or a photo the family
// uploaded (14.1: checked and stripped of metadata on the server, kept under data/uploads). It belongs to the child,
// so every family that follows the child sees it (D54). The trait values are the keys of docs/tokens.json → avatar
// (a test keeps the two in step).

export const AVATAR_SKIN = ['pale', 'light', 'medium', 'tan', 'brown', 'dark'] as const;
export const AVATAR_HAIR = ['black', 'dark', 'brown', 'lightbrown', 'blond', 'red', 'grey'] as const;
export const AVATAR_EYES = ['brown', 'hazel', 'green', 'blue', 'grey'] as const;

export const avatarTraits = registry.register(
  'AvatarTraits',
  z.object({
    age: z.enum(['kid', 'preteen', 'teen', 'adult']),
    look: z.enum(['boy', 'girl', 'neutral']),
    skin: z.enum(AVATAR_SKIN),
    hair: z.enum(AVATAR_HAIR),
    style: z.enum(['buzz', 'short', 'medium', 'long', 'ponytail', 'bob', 'curly', 'braids']),
    eyes: z.enum(AVATAR_EYES),
    glasses: z.boolean(),
  }),
);
export type AvatarTraits = z.infer<typeof avatarTraits>;

/** What students.avatar holds */
export type StoredAvatar =
  { kind: 'traits'; traits: AvatarTraits } | { kind: 'photo'; key: string; mime: string; bytes: number };

/** What the app gets: the traits to draw, or where the photo is (the version in the URL changes with the photo) */
export const avatarOut = registry.register(
  'Avatar',
  z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('traits'), traits: avatarTraits }),
      z.object({ kind: z.literal('photo'), url: z.string() }),
    ])
    .nullable(),
);

export function avatarOf(stored: unknown, studentId: string): z.infer<typeof avatarOut> {
  const a = stored as StoredAvatar | null | undefined;
  if (!a) return null;
  if (a.kind === 'traits') {
    const traits = avatarTraits.safeParse(a.traits);
    return traits.success ? { kind: 'traits', traits: traits.data } : null;
  }
  if (a.kind === 'photo' && a.key) {
    const v = createHash('sha256').update(a.key).digest('hex').slice(0, 12);
    return { kind: 'photo', url: `/api/students/${studentId}/photo?v=${v}` };
  }
  return null;
}
