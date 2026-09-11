import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Raw Prisma access is a boundary, not a convenience.
 *
 * Public pages and public lib helpers must go through the typed read
 * primitives in `@synac/db` (`queries/public.ts`, `queries/publicPages.ts`), so
 * that "what a public visitor may read" is decided in one auditable place
 * rather than re-derived in every page. The admin surface and the API route
 * handlers own their own authorization checks and keep direct access.
 */
const RESTRICTED_PRISMA_IMPORT = {
  name: '@synac/db',
  importNames: [
    'getPrismaClient',
    'getPrismaClientForUrl',
    'createPrismaClient',
    'PrismaClient',
  ],
  message:
    'Public code must use the typed read primitives from @synac/db (queries/public.ts) instead of a raw Prisma client. Direct Prisma access is allowed only in src/app/api/**, src/app/admin/**, and src/lib/admin*.ts / rateLimit.ts / observability.ts.',
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    name: 'synac/public-read-boundary',
    files: ['src/app/**/*.ts', 'src/app/**/*.tsx', 'src/lib/public*.ts'],
    ignores: ['src/app/api/**', 'src/app/admin/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [RESTRICTED_PRISMA_IMPORT] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression > Literal[value='@synac/db']",
          message: RESTRICTED_PRISMA_IMPORT.message,
        },
        {
          selector:
            "CallExpression[callee.name='require'] > Literal[value='@synac/db']",
          message: RESTRICTED_PRISMA_IMPORT.message,
        },
      ],
    },
  },
]);

export default eslintConfig;
