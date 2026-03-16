import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5179',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter server dev',
      port: 3001,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter client dev',
      port: 5179,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
