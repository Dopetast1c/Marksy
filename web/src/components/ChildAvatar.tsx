import type { Schemas } from '../api/client';
import { useStudent } from '../hooks/useStudent';
import { appPath } from '../lib/base';
import { Avatar, defaultTraits } from './Avatar';

// A child's avatar as the family set it (docs/design.md 5.6, D9): the traits drawn by Avatar, or the photo the family
// uploaded (served only to the families that follow the child, 14.1), or the neutral look until either exists. A drawn
// avatar's background follows the child's place in the family order.

type AvatarData = Schemas['Avatar'];

export function ChildAvatar({ avatar, index, size = 34 }: { avatar: AvatarData; index: number; size?: number }) {
  if (avatar?.kind === 'photo')
    return (
      <img
        src={appPath(avatar.url)}
        alt=""
        width={size}
        height={size}
        className="block shrink-0 rounded-pill object-cover"
        style={{ width: size, height: size }}
      />
    );
  return <Avatar traits={avatar?.kind === 'traits' ? avatar.traits : defaultTraits()} index={index} size={size} />;
}

/** The avatar of a child this person sees, by id (StudentBar, "Who first?" pick.title) */
export function StudentAvatar({ studentId, index, size }: { studentId: string; index: number; size?: number }) {
  const student = useStudent(studentId);
  return <ChildAvatar avatar={student?.avatar ?? null} index={index} {...(size ? { size } : {})} />;
}
