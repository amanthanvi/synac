import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      CONVEX_URL: process.env.CONVEX_URL ?? 'http://127.0.0.1:3210',
    },
    fileParallelism: false,
    maxWorkers: 1,
  },
});
