import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT ?? '5175';
const url = 'http://127.0.0.1:' + port;
export default defineConfig({
  testDir: './tests', testMatch: '**/{app,exam,qf*}.spec.ts', workers: 1, retries: 0, timeout: 60000,
  use: { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', baseURL: url,
    trace: 'off', screenshot: 'off', video: 'off' },
  outputDir: 'verification.local/playwright', reporter: 'list',
  webServer: { command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`, url, reuseExistingServer: false },
});
