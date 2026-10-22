import type { ProviderManifest } from '../providers/manifest';
import type { StudentRef } from './schemas';

/**
 * The short name for headers and notifications. The provider's own displayName wins, then givenName; otherwise the
 * given name is taken from fullName by the manifest's name order (docs/providers.md section 10).
 */
export function displayNameOf(student: StudentRef, nameOrder: ProviderManifest['nameOrder']): string {
  if (student.displayName?.trim()) return student.displayName.trim();
  if (student.givenName?.trim()) return student.givenName.trim();
  const parts = student.fullName.trim().split(/\s+/);
  // given-first: "Given Family"; family-first: "Family Given [Middle]", as in JP, CN, KR, HU and post-Soviet lists
  const given = nameOrder === 'given-first' ? parts[0] : (parts[1] ?? parts[0]);
  return given ?? student.fullName;
}
