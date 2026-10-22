import { createApp } from './app';
import { createDb } from './db/client';
import { log } from './log';
import { readSyncConfig } from './sync/config';
import { createScheduler } from './sync/scheduler';

const port = Number(process.env.PORT ?? 3000);
// The API listens on this machine only. Browsers, phones on the home network included, reach it through the PWA's
// dev server (or the reverse proxy in production), which forwards /api: one origin, so session cookies just work.
const host = process.env.HOST ?? '127.0.0.1';
createApp().listen(port, host, () => {
  // No personal data in logs, ever (CLAUDE.md)
  console.log(`marksy api on ${host}:${port}`);
});

// The collector runs in the same process (docs/design.md 10.1); SYNC_ENABLED=false keeps a copy away from every diary.
const config = readSyncConfig();
if (config.enabled) {
  const db = createDb();
  createScheduler({ db, config, log });
  log.info('collector scheduler on', { count: config.tickMinutes });
} else {
  log.info('collector scheduler off (SYNC_ENABLED=false)');
}
