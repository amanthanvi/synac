/**
 * Environment every test in this package needs before the module under test is
 * evaluated, notably the hashing salts, which `lib/rateLimit.ts` asserts at
 * import time.
 *
 * Tests import this as their *first* import, because static imports run in
 * source order and that is what guarantees the values are set before anything
 * reads them. `vitest.config.ts` also lists it in `setupFiles`, which is
 * harmless: every assignment below is `||=`.
 */
// NODE_ENV is set to 'test' by Vitest itself and is read-only in @types/node.
process.env.DATABASE_URL ||=
  'postgresql://postgres@127.0.0.1:5433/synac_test?schema=public';
process.env.SYNAC_STAGING_DATABASE_URL ||=
  'postgresql://postgres@127.0.0.1:5433/synac_staging_test?schema=public';
process.env.NEXT_PUBLIC_SITE_URL ||= 'http://localhost:3000';
process.env.SYNAC_RATE_LIMIT_SALT ||= 'test-rate-limit-salt';

export {};
