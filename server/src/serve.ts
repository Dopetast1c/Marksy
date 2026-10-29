import type { Server } from 'node:http';
import { createApp } from './app';
import { masterKey } from './crypto/credentials';
import { createDb, migrateDb } from './db/client';
import { errorSummary, log } from './log';
import { dailyJanitor, readRetention } from './retention';
import { readRuntimeConfig } from './runtime/config';
import { createInternalApp } from './runtime/internal';
import { appVersion } from './runtime/version';
import { readSyncConfig } from './sync/config';
import { createScheduler } from './sync/scheduler';
import type { Scheduler } from './sync/scheduler';

// The server process (docs/design.md 10.1): migrations first, then the API, the internal status, the collector and
// the retention janitor. A migration that fails stops the process before it answers, so its health never turns
// green and the updater puts the previous image back on the unchanged schema (CLAUDE.md, migrations).

/** SESSION_SECRET (pnpm setup:env or init-env generates it): the API refuses to start without a real one */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() ?? '';
  if (secret.length < 32)
    throw new Error('SESSION_SECRET must be set, 32 characters or more (pnpm setup:env, init-env)');
  return secret;
}

export async function serve(): Promise<void> {
  const runtime = readRuntimeConfig();
  const version = appVersion();
  const secret = sessionSecret();
  const credentialsKey = masterKey();
  const db = createDb();
  try {
    const applied = await migrateDb(db);
    log.info('migrations', { count: applied });
  } catch (err) {
    // the message names the failing statement's error, never a value from the data
    log.error('migrations failed: the schema is unchanged, the server stops', { reason: errorSummary(err) });
    await db.$client.end().catch(() => undefined);
    process.exit(1);
  }

  const uploadsDir = process.env.UPLOADS_DIR?.trim() || undefined;
  const servers: Server[] = [];
  servers.push(
    createApp({
      db,
      credentialsKey,
      secret,
      basePath: runtime.basePath,
      trustProxy: runtime.trustProxy,
      signup: runtime.signup,
      apiDocs: runtime.apiDocs,
      version,
      log,
      ...(uploadsDir && { uploadsDir }),
    }).listen(runtime.port, runtime.host, () => {
      // No personal data in logs, ever (CLAUDE.md)
      console.log(
        `marksy ${version.version} (${version.commit}) api on ${runtime.host}:${runtime.port}${runtime.basePath}`,
      );
    }),
  );

  // The collector runs in the same process (docs/design.md 10.1); SYNC_ENABLED=false keeps a copy away from every
  // diary, and so does the database's switch after a restore (runtime/instance.ts).
  const config = readSyncConfig();
  const jobs = createDb();
  if (runtime.internal) {
    const { port, token } = runtime.internal;
    servers.push(createInternalApp({ db: jobs, token, syncEnv: config.enabled }).listen(port, runtime.host));
  }
  // the retention janitor runs once a day (docs/design.md 10.4): after the first tick of the day while the collector is
  // on, on its own hourly check while it is off, so old data and orphaned pictures go either way
  const janitor = dailyJanitor(
    jobs,
    readRetention(),
    (report) => {
      // one line per table under safe keys: table names like raw_responses would be redacted as keys
      for (const [kind, count] of Object.entries(report)) if (count) log.info('retention', { kind, count });
    },
    uploadsDir,
  );
  let scheduler: Scheduler | undefined;
  const timers: NodeJS.Timeout[] = [];
  if (config.enabled) {
    scheduler = createScheduler({ db: jobs, config, log, afterTick: janitor });
    log.info('collector scheduler on', { count: config.tickMinutes });
  } else {
    log.info('collector scheduler off (SYNC_ENABLED=false)');
    const tidy = () => void janitor().catch(() => log.warn('retention failed'));
    timers.push(setTimeout(tidy, 60_000).unref(), setInterval(tidy, 3_600_000).unref());
  }

  // docker stop sends SIGTERM: no new requests or ticks, the pools close, and the process ends within the 10 seconds
  // Docker waits before it kills
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info('stopping', { reason: signal });
    scheduler?.stop();
    for (const t of timers) clearTimeout(t);
    const force = setTimeout(() => process.exit(0), 8_000);
    force.unref();
    void Promise.all(servers.map((s) => new Promise((r) => s.close(r))))
      .then(() => Promise.all([db.$client.end(), jobs.$client.end()]))
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}
