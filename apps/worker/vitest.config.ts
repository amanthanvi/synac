import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@synac/db': path.resolve(here, '../../packages/db/src/index.ts'),
    },
  },
  test: {
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac?schema=public',
      SYNAC_STAGING_DATABASE_URL:
        process.env.SYNAC_STAGING_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac_staging?schema=public',
    },
  },
});
