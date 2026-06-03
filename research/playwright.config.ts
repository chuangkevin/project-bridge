import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'always' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://designbridge.housefun.com.tw',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20000,
  },
});
