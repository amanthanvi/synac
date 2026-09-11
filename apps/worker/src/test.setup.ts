/**
 * Global vitest setup, registered via `setupFiles` in `vitest.config.ts`.
 *
 * Two jobs:
 *  - guarantee `NODE_ENV=test` so `@synac/db/testing` will permit truncating
 *    the integration database;
 *  - clear per-process caches that would otherwise leak between test files
 *    (robots.txt verdicts, rate-limit pacing).
 */
import { beforeEach } from 'vitest';

import { clearRobotsCache } from './ingest/robots.js';
import { resetRateLimiter } from './ingest/rateLimit.js';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

beforeEach(() => {
  clearRobotsCache();
  resetRateLimiter();
});
