/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API runs on 127.0.0.1:3000 (server); the PWA dev server proxies /api so cookies stay same-origin. `pnpm dev`
// listens on this machine only; `pnpm dev:lan` (vite --host) also listens on the home network, so a phone opens
// http://<computer-ip>:5173 and everything, /api included, goes through this one port (README, "Testing on a phone").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'node',
  },
});
