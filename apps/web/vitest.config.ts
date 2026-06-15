import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(here, 'src'),
      '@synac/db': path.join(here, '..', '..', 'packages', 'db', 'src', 'index.ts'),
      '@synac/shared': path.join(
        here,
        '..',
        '..',
        'packages',
        'shared',
        'src',
        'index.ts',
      ),
    },
  },
  test: {
    env: {
      CONVEX_URL: process.env.CONVEX_URL ?? 'http://127.0.0.1:3210',
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    },
    fileParallelism: false,
  },
});
