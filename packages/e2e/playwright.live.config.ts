import { defineConfig } from '@playwright/test';

const liveBaseURL = process.env.LIVE_BASE_URL || 'https://designbridge.sisihome.org';
const liveApiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL || liveBaseURL;

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: liveBaseURL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'live-smoke',
      testDir: './tests/e2e',
      testMatch: 'smoke.spec.ts',
    },
    {
      name: 'live-e2e',
      testDir: './tests/e2e',
      testIgnore: 'smoke.spec.ts',
      dependencies: ['live-smoke'],
    },
  ],
  metadata: {
    liveBaseURL,
    liveApiBaseURL,
  },
});
