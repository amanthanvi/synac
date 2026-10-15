import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceDir } from './scripts/runtime.mjs';

const skillDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  testDir: path.join(skillDir, 'scripts'),
  outputDir: path.join(evidenceDir, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['line'],
    ['html', { outputFolder: path.join(evidenceDir, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on',
    screenshot: 'on',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};
