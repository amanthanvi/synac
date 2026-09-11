import { defineConfig, devices } from '@playwright/test';

/**
 * The suite runs against an already-running site. Start the local stack first
 * (see docs/contributing/local-dev.md), then point `E2E_BASE_URL` at it.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: 'line',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
