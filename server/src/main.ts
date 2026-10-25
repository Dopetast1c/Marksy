import { createApp } from './app';
import { masterKey } from './crypto/credentials';
import { createDb } from './db/client';
import { log } from './log';
import { dailyJanitor, readRetention } from './retention';
import { readSyncConfig } from './sync/config';
import { createScheduler } from './sync/scheduler';

const port = Number(process.env.PORT ?? 3000);
// The API listens on this machine only. Browsers, phones on the home network included, reach it through the PWA's
// dev server (or the reverse proxy in production), which forwards /api: one origin, so session cookies just work.
const host = process.env.HOST ?? '127.0.0.1';
/** SESSION_SECRET (pnpm setup:env generates it): the API refuses to start without a real one */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() ?? '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must be set in .env, 32 characters or more (pnpm setup:env)');
  return secret;
}

// cookies are Secure only when the app is served over https (CLAUDE.md, local and phone testing)
const secureCookies = (process.env.PUBLIC_URL ?? '').startsWith('https://');
createApp({
  db: createDb(),
  credentialsKey: masterKey(),
  secret: sessionSecret(),
  secureCookies,
  log,
  ...(process.env.UPLOADS_DIR?.trim() && { uploadsDir: process.env.UPLOADS_DIR.trim() }),
}).listen(port, host, () => {
  // No personal data in logs, ever (CLAUDE.md)
  console.log(`marksy api on ${host}:${port}`);
});

// The collector runs in the same process (docs/design.md 10.1); SYNC_ENABLED=false keeps a copy away from every diary.
const config = readSyncConfig();
const jobs = createDb();
// the retention janitor runs once a day (docs/design.md 10.4): after the first tick of the day while the collector is
// on, on its own hourly check while it is off, so old data and orphaned pictures go either way
const janitor = dailyJanitor(
  jobs,
  readRetention(),
  (report) => {
    // one line per table under safe keys: table names like raw_responses would be redacted as keys
    for (const [kind, count] of Object.entries(report)) if (count) log.info('retention', { kind, count });
  },
  process.env.UPLOADS_DIR?.trim() || undefined,
);
if (config.enabled) {
  createScheduler({ db: jobs, config, log, afterTick: janitor });
  log.info('collector scheduler on', { count: config.tickMinutes });
} else {
  log.info('collector scheduler off (SYNC_ENABLED=false)');
  const tidy = () => void janitor().catch(() => log.warn('retention failed'));
  setTimeout(tidy, 60_000).unref();
  setInterval(tidy, 3_600_000).unref();
}
