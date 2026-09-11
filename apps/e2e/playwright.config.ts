import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite for the public site.
 *
 * Assumes a built, seeded app is already listening on `E2E_BASE_URL`:
 *
 *   pnpm build
 *   pnpm db:seed && pnpm db:seed:content
 *   pnpm --filter @synac/web start
 *   pnpm --filter @synac/e2e test:e2e
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [
        ['list'],
        ['html', { outputFolder: './playwright-report', open: 'never' }],
      ]
    : [['list']],
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
