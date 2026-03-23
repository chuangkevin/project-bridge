import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
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
      command: 'cd ../../packages/server && node dist/index.js',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'cd ../../packages/client && npx vite --port 5188 --host 0.0.0.0',
      port: 5188,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
