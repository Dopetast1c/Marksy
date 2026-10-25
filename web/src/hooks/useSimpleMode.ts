import { useMe } from '../api/queries';

/**
 * Simple mode (docs/design.md 5.7): a student's own setting, switched by them in Ещё or by a parent on the child's
 * screen. It changes the student's screens only; a parent looking at the same child sees the full app.
 */
export function useSimpleMode(): boolean {
  const me = useMe();
  return me.data?.family?.role === 'student' && me.data.user.uiMode === 'simple';
}
