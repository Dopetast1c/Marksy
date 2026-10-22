import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
// The API listens on this machine only. Browsers, phones on the home network included, reach it through the PWA's
// dev server (or the reverse proxy in production), which forwards /api: one origin, so session cookies just work.
const host = process.env.HOST ?? '127.0.0.1';
createApp().listen(port, host, () => {
  // No personal data in logs, ever (CLAUDE.md)
  console.log(`marksy api on ${host}:${port}`);
});
