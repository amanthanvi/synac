import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@synac/db/testing': path.resolve(
        here,
        '../../packages/db/src/testing.ts',
      ),
      '@synac/db': path.resolve(here, '../../packages/db/src/index.ts'),
    },
  },
  test: {
    // Several suites truncate the shared integration database between tests, so
    // any overlap between files corrupts unrelated runs (foreign keys vanish
    // mid-test). `fileParallelism: false` alone still permits more than one
    // worker process; `singleFork` pins every file to one process so execution
    // is strictly serial.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true, minForks: 1, maxForks: 1 } },
    sequence: { concurrent: false },
    setupFiles: [path.resolve(here, 'src/test.setup.ts')],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public',
      SYNAC_STAGING_DATABASE_URL:
        process.env.SYNAC_STAGING_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac_staging_test?schema=public',
    },
  },
});
