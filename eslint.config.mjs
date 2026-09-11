import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Root flat config. It lints `convex/`, `tests/`, `tools/*`, `packages/*`, and
 * the repository's own scripts. `apps/web` has its own config that composes
 * `eslint-config-next`, so nothing here reaches it.
 *
 * Type-aware rules run through the TypeScript project service, which resolves
 * each file to the nearest tsconfig. Plain JavaScript files opt out, because
 * no project covers them.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/src/generated/**',
      '**/_generated/**',
      'apps/web/**',
      'experiments/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.cjs', '*.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // `tests/convex/**` uses `import.meta.glob`, whose types ship with
    // `vite/client`. `vite` is not a declared dependency of this workspace, so
    // the glob resolves to an error type and every value that flows from it
    // trips the unsafe-value rules. The real fix belongs with the test suite:
    // declare `vite`, then restore `"types": ["node", "vite/client"]` in
    // `tests/tsconfig.json` and delete this block.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  // Type-aware findings that predate this config. Each exemption names one
  // file, so the rules stay on everywhere else and the backlog is countable.
  // Fixing a file means deleting its block.
  {
    // 4 findings: an unnecessary assertion and three values flowing from an
    // `any` returned by the export reader.
    files: ['tools/content/src/bootstrap-from-export.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // 1 finding: a nullish fallback stringifies a value that may be an object.
    files: ['packages/shared/src/index.ts'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  {
    rules: {
      'no-console': 'off',
      // `_`-prefixed bindings are deliberately unused, mostly signature
      // placeholders left by the Prisma-to-Convex migration.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // The repository bans TypeScript suppression outright.
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
