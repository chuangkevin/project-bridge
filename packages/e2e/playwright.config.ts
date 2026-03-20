import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5188',
    headless: false,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'smoke',
      testDir: './tests/e2e',
      testMatch: 'smoke.spec.ts',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      testIgnore: 'smoke.spec.ts',
      dependencies: ['smoke'],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter server dev',
      port: 3001,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter client dev -- --port 5188',
      port: 5188,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
