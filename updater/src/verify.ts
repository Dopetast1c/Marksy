import { execFile } from 'node:child_process';

// Before anything is pulled, every image of an update is checked with cosign: it must carry a keyless signature made
// by this repository's GitHub Actions, by the release workflow on a version tag (releases) or the image workflow on
// the branch the channel follows (edge, preview). Any other signer, or none, and the update is refused.
// The end-to-end test signs its images with a key of its own; that key is accepted only for a registry on localhost.

export const REPOSITORY = 'https://github.com/Dopetast1c/Marksy';
export const ISSUER = 'https://token.actions.githubusercontent.com';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The signer an image of this channel must have */
export function signerIdentity(channelKind: 'release' | 'edge' | 'preview'): string {
  const repo = esc(REPOSITORY);
  if (channelKind === 'edge') return `^${repo}/\\.github/workflows/images\\.yml@refs/heads/main$`;
  if (channelKind === 'preview') return `^${repo}/\\.github/workflows/images\\.yml@refs/heads/r1-release$`;
  return `^${repo}/\\.github/workflows/release\\.yml@refs/tags/v\\d+\\.\\d+\\.\\d+$`;
}

export function cosignArgs(ref: string, opts: { identity: string; testKey?: string }): string[] {
  if (opts.testKey) {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?\//.test(ref)) throw new Error('a test key is accepted only on localhost');
    return ['verify', '--key', opts.testKey, '--insecure-ignore-tlog=true', '--allow-http-registry=true', ref];
  }
  return ['verify', '--certificate-identity-regexp', opts.identity, '--certificate-oidc-issuer', ISSUER, ref];
}

export type Verifier = (ref: string, channelKind: 'release' | 'edge' | 'preview') => Promise<void>;

export function cosignVerifier(opts: { testKey?: string; bin?: string } = {}): Verifier {
  return (ref, channelKind) =>
    new Promise((resolve, reject) => {
      if (!/@sha256:[a-f0-9]{64}$/.test(ref)) return reject(new Error('verify by digest only'));
      const args = cosignArgs(ref, { identity: signerIdentity(channelKind), testKey: opts.testKey });
      execFile(opts.bin ?? 'cosign', args, { timeout: 120_000, maxBuffer: 4_000_000 }, (err, _out, stderr) => {
        if (!err) return resolve();
        const line =
          String(stderr)
            .split('\n')
            .find((l) => l.startsWith('Error')) ?? 'no valid signature';
        reject(new Error(`signature: ${line.slice(0, 200)}`));
      });
    });
}
