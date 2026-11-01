// Which release a host installs (docs/running.md, updates; UPDATE_CHANNEL). A channel is also the tag the host's
// images carry, so `docker compose up` never moves away from what the updater installed:
//   "1"      every MINOR and PATCH release of major 1, never 2.0.0 (the default)
//   "1.4"    only PATCH releases of 1.4
//   "1.4.2"  pinned: no automatic update
//   "stable" every release, a new MAJOR included
//   "edge"   the newest build of main, by digest; only when set by hand (the runbook warns against it)
//   "preview" the newest build of the release branch, by digest, before the first release
// A host never installs a version lower than the one it runs, except in a rollback.

export type Version = readonly [number, number, number];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v: string): Version | null {
  const m = v.trim().replace(/^v/, '').match(SEMVER);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export const formatVersion = (v: Version) => v.join('.');

export type Channel =
  | { kind: 'major'; major: number }
  | { kind: 'minor'; major: number; minor: number }
  | { kind: 'pinned'; version: Version }
  | { kind: 'stable' }
  | { kind: 'digest'; tag: 'edge' | 'preview' };

export function parseChannel(value: string | undefined): Channel {
  const v = (value ?? '').trim() || '1';
  if (v === 'stable') return { kind: 'stable' };
  if (v === 'edge' || v === 'preview') return { kind: 'digest', tag: v };
  if (/^\d+$/.test(v)) return { kind: 'major', major: Number(v) };
  const minor = v.match(/^(\d+)\.(\d+)$/);
  if (minor) return { kind: 'minor', major: Number(minor[1]), minor: Number(minor[2]) };
  const pinned = parseVersion(v);
  if (pinned) return { kind: 'pinned', version: pinned };
  throw new Error(`UPDATE_CHANNEL must be 1, 1.4, 1.4.2, stable, edge or preview, not ${v}`);
}

/** The tag the host's images carry for this channel */
export function channelTag(value: string | undefined): string {
  return (value ?? '').trim() || '1';
}

/**
 * The release to install from the versions the registry has, or null: the newest one the channel allows that is
 * higher than the running version. A digest channel is decided by digests, not here.
 */
export function pickRelease(channel: Channel, running: Version | null, available: string[]): Version | null {
  if (channel.kind === 'pinned' || channel.kind === 'digest') return null;
  const allowed = available
    .map(parseVersion)
    .filter((v): v is Version => v !== null)
    .filter((v) =>
      channel.kind === 'stable'
        ? true
        : channel.kind === 'major'
          ? v[0] === channel.major
          : v[0] === channel.major && v[1] === channel.minor,
    )
    .filter((v) => !running || compareVersions(v, running) > 0)
    .sort(compareVersions);
  return allowed.at(-1) ?? null;
}
