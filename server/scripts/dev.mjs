import { spawn } from 'node:child_process';

// `pnpm dev` and `pnpm dev:lan` for the API: tsx watch with file polling. On Windows the native file events tsx
// relies on (fs.watch through chokidar) were seen to stop after a while, so edits stopped restarting the server and it
// kept answering with old code. Polling compares file times instead and does not depend on those events. Development
// only: nothing in production runs this.

// one command string: the shell finds tsx in node_modules/.bin on every platform
const child = spawn('tsx watch --env-file-if-exists=../.env src/main.ts', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '300' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
