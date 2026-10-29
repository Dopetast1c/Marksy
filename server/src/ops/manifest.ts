import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { BackupKind } from '../db/schema';

// The manifest written next to every dump (docs/running.md, backups): which version took it, how many migrations its
// schema had, and how many rows each table held in the very snapshot the dump was taken from. A restore checks the
// files against their checksums and the restored tables against these counts. Counts and versions only, nothing else.

export const MANIFEST_FORMAT = 1;

export interface BackupFile {
  file: string;
  bytes: number;
  sha256: string;
}

export interface BackupManifest {
  format: typeof MANIFEST_FORMAT;
  app: 'marksy';
  kind: BackupKind | 'export';
  createdAt: string;
  version: string;
  commit: string;
  /** an update's backup: the version it leads to */
  toVersion: string | null;
  migrations: number;
  tables: Record<string, number>;
  dump: BackupFile;
  uploads: (BackupFile & { files: number }) | null;
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export function parseManifest(text: string): BackupManifest {
  const m = JSON.parse(text) as Partial<BackupManifest>;
  if (m.app !== 'marksy' || m.format !== MANIFEST_FORMAT || !m.dump?.file || !m.tables)
    throw new Error('not a Marksy backup manifest');
  return m as BackupManifest;
}

/** Tables whose restored count differs from the manifest's: none when the restore is complete */
export function countMismatches(expected: Record<string, number>, actual: Record<string, number>): string[] {
  return Object.entries(expected)
    .filter(([table, n]) => actual[table] !== n)
    .map(([table, n]) => `${table}: ${n} in the backup, ${actual[table] ?? 'no table'} restored`);
}
