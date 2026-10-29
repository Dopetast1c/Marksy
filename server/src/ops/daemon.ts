import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { backupRuns } from '../db/schema';
import type { BackupKind } from '../db/schema';
import { errorSummary, log } from '../log';
import { appVersion } from '../runtime/version';
import { recordedBackup, rotateBackups } from './backup';

// The backup service (docs/running.md, backups): a container of the server image that takes the daily backup at
// BACKUP_TIME, catches up a day missed while the host was off, rotates, and takes a backup on demand for the updater
// and the `marksy backup` command (POST /backup on BACKUP_INTERNAL_URL, with MARKSY_INTERNAL_TOKEN). Backups never
// overlap: one runs at a time.

export interface DaemonConfig {
  db: Db;
  databaseUrl: string;
  dir: string;
  uploadsDir?: string;
  /** "HH:MM", local time of the container (TZ) */
  time: string;
  port: number;
  token: string;
  now?: () => Date;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Whether the daily backup is due: past today's time and none succeeded since then */
export function dailyDue(now: Date, time: string, lastSuccess: Date | null): boolean {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const today = new Date(now);
  today.setHours(h, m, 0, 0);
  const slot = now >= today ? today : new Date(today.getTime() - 86_400_000);
  return !lastSuccess || lastSuccess < slot;
}

export async function backupDaemon(cfg: DaemonConfig): Promise<void> {
  if (!/^\d{2}:\d{2}$/.test(cfg.time)) throw new Error('BACKUP_TIME must be HH:MM');
  const now = () => cfg.now?.() ?? new Date();
  const version = appVersion();
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const take = (kind: BackupKind, toVersion?: string | null, fromVersion?: string) =>
    serial(() =>
      recordedBackup(cfg.db, {
        databaseUrl: cfg.databaseUrl,
        dir: cfg.dir,
        kind,
        version: fromVersion || version.version,
        commit: version.commit,
        toVersion: toVersion ?? null,
        ...(cfg.uploadsDir && { uploadsDir: cfg.uploadsDir }),
      }).then(async (r) => {
        const removed = await rotateBackups(cfg.dir);
        log.info('backup taken', { kind, count: removed.length });
        return r;
      }),
    );

  const lastDaily = async () => {
    const [row] = await cfg.db
      .select({ at: backupRuns.startedAt })
      .from(backupRuns)
      .where(
        and(eq(backupRuns.kind, 'daily'), eq(backupRuns.status, 'success'), gte(backupRuns.startedAt, new Date(0))),
      )
      .orderBy(desc(backupRuns.startedAt))
      .limit(1);
    return row?.at ?? null;
  };
  let failedAt = 0;
  const tick = async () => {
    try {
      // after a failure, the next try waits an hour (the failure is recorded; M9 alerts the admin)
      if (Date.now() - failedAt < 3_600_000) return;
      if (dailyDue(now(), cfg.time, await lastDaily())) await take('daily');
    } catch (err) {
      failedAt = Date.now();
      log.error('daily backup failed', { reason: errorSummary(err) });
    }
  };
  // the first check two minutes after start: a host that was off at BACKUP_TIME catches up soon after it is back
  setTimeout(() => void tick(), 120_000).unref();
  setInterval(() => void tick(), 60_000).unref();

  const expected = digest(`Bearer ${cfg.token}`);
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), expected))
      return send(401, { error: 'unauthorized' });
    if (req.method !== 'POST' || req.url !== '/backup') return send(404, { error: 'not_found' });
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > 1000) req.destroy();
    });
    req.on('end', () => {
      let input: { kind?: string; from?: string; to?: string } = {};
      try {
        input = body ? (JSON.parse(body) as typeof input) : {};
      } catch {
        return send(400, { error: 'invalid_json' });
      }
      const kind: BackupKind = input.kind === 'pre-update' ? 'pre-update' : 'manual';
      take(kind, input.to ?? null, input.from).then(
        (r) => send(200, { file: `${r.name}.dump`, manifest: `${r.name}.json`, kind }),
        (err: unknown) => send(500, { error: err instanceof Error ? err.message : 'failed' }),
      );
    });
  });
  server.listen(cfg.port, '0.0.0.0', () => log.info('backup service on', { count: cfg.port }));
}
