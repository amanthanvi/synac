import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public',
    },
    fileParallelism: false,
    maxWorkers: 1,
  },
});
