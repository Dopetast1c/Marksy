import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// The updater's own state, in its volume (UPDATE_STATE_DIR): the history of every attempt as JSON lines (the last 500
// are kept) and the pause switch. Versions, digests, file names, times and outcomes only.

export type Outcome =
  'updated' | 'rolled_back' | 'failed' | 'refused_signature' | 'waiting_quiet_hours' | 'waiting_collector' | 'paused';

export interface Attempt {
  at: string;
  trigger: 'poll' | 'hook' | 'manual' | 'start';
  channel: string;
  from: string;
  to: string;
  outcome: Outcome;
  reason?: string;
  backup?: string;
  migrations?: { before: number; after: number };
  durationMs?: number;
  /** from stopping the old server until the new one answered */
  downtimeMs?: number;
  digests?: Record<string, string>;
}

export const KEEP = 500;

export function stateStore(dir: string) {
  const file = join(dir, 'history.jsonl');
  const pauseFile = join(dir, 'paused');
  return {
    async append(a: Attempt): Promise<void> {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(a)}\n`);
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
      if (lines.length > KEEP) await writeFile(file, `${lines.slice(-KEEP).join('\n')}\n`);
    },
    async list(n = 20): Promise<Attempt[]> {
      try {
        const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
        return lines.slice(-n).map((l) => JSON.parse(l) as Attempt);
      } catch {
        return [];
      }
    },
    async paused(): Promise<boolean> {
      try {
        await readFile(pauseFile);
        return true;
      } catch {
        return false;
      }
    },
    async setPaused(on: boolean): Promise<void> {
      await mkdir(dir, { recursive: true });
      if (on) await writeFile(pauseFile, new Date().toISOString());
      else await rm(pauseFile, { force: true });
    },
  };
}

export type StateStore = ReturnType<typeof stateStore>;
