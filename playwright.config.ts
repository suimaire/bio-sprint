import { defineConfig, devices } from '@playwright/test';

const pagesURL = process.env.PAGES_URL;
const localURL = `http://127.0.0.1:${process.env.E2E_PORT ?? '5174'}`;

export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  testMatch: pagesURL ? '**/pages.spec.ts' : '**/{app,exam}.spec.ts',
  use: { ...devices['Desktop Chrome'], channel: 'msedge', baseURL: pagesURL ?? localURL, trace: 'retain-on-failure' },
  // Dedicated port: never accidentally test an old preview from another checkout.
  webServer: pagesURL ? undefined : { command: `npm run dev -- --port ${new URL(localURL).port}`, url: localURL, reuseExistingServer: false },
  reporter: 'list',
});
