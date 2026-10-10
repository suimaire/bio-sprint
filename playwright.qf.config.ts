import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:' + (process.env.E2E_PORT ?? '5175');
export default defineConfig({
  testDir: './tests', testMatch: '**/qf*.spec.ts', workers: 1, retries: 0, timeout: 60000,
  use: { channel: 'msedge', baseURL: url, trace: 'off', screenshot: 'off', video: 'off' },
  // Real private source material must not appear in traces or screenshots.
  outputDir: 'verification.local/playwright', reporter: 'list',
  webServer: { command: 'npm run dev -- --port ' + new URL(url).port, url, reuseExistingServer: false },
});
