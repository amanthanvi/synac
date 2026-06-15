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
      CONVEX_URL: process.env.CONVEX_URL ?? 'http://127.0.0.1:3210',
    },
  },
});
