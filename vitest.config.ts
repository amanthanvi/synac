import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      all: true,
      include: ['src/lib/searchBuild.ts', 'src/content/schema.ts'],
      exclude: [
        '**/*.astro',
        'src/pages/**',
        'src/scripts/**',
        'scripts/**',
        'src/content/config.ts',
        'src/types/**',
        'astro.config.mjs',
        'playwright.config.ts',
      ],
      thresholds: { lines: 80, statements: 80, branches: 70 },
    },
  },
});
