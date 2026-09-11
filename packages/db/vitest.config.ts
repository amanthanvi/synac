import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public',
    },
    setupFiles: ['./src/test.setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/queries/**'],
      // These modules are exercised by the apps/web and apps/worker suites,
      // which per-package coverage cannot see.
      exclude: [
        'src/**/*.test.ts',
        'src/queries/applyProposedChange.ts',
        'src/queries/public.ts',
        'src/queries/publicPages.ts',
        'src/queries/relationships.ts',
        'src/queries/sources.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
});
