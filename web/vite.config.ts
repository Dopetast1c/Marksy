/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The API runs on 127.0.0.1:3000 (server); the PWA dev server proxies /api so cookies stay same-origin. `pnpm dev`
// listens on this machine only; `pnpm dev:lan` (vite --host) also listens on the home network, so a phone opens
// http://<computer-ip>:5173 and everything, /api included, goes through this one port (README, "Testing on a phone").
// xfwd: the proxy appends the device's own address to X-Forwarded-For, and the API (trust proxy: loopback) takes that
// one, so each device has its own login limit and no client can claim another address.
const api = { target: 'http://127.0.0.1:3000', xfwd: true };

// the app's version, as Ещё shows it («Marksy 0.1.0 · …»), and the project's page, where the app links to its docs and
// to the translation form: the root package.json's, one place for the whole workspace
const { version, repository } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
  repository: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __MARKSY_VERSION__: JSON.stringify(version), __MARKSY_REPO__: JSON.stringify(repository) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': api },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': api },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
