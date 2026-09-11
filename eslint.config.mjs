import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/src/generated/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.lighthouseci/**',
    ],
  },
  js.configs.recommended,
  // Type-aware linting. `projectService` resolves the nearest tsconfig per
  // file, which is what a workspace with per-package tsconfigs needs.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: repoRoot,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // The documented "no TS suppression" rule (CONTRIBUTING.md) is enforced,
      // not merely requested.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
  // Scripts served verbatim to the browser (no bundler, no tsconfig).
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Config/tooling files are plain JS and are not covered by any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    rules: {
      'no-console': 'off',
    },
  },
];
