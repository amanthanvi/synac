import { register } from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { RATE_LIMIT_PER_MINUTE } from '../../convex/rateLimitPolicy';
import schema from '../../convex/schema';
import { modules } from './helpers';

const SERVICE_KEY = 'test-service-key';

const SCOPES = ['search', 'api_read', 'csp_report'] as const;

function bucketKey(nibble: string): string {
  return `ip:${nibble.repeat(64)}`;
}

describe('rateLimit scopes', () => {
  test('exhausting one scope leaves the other scopes open for the same caller', async () => {
    process.env.SYNAC_CONVEX_SERVICE_KEY = SERVICE_KEY;
    const t = convexTest(schema, modules);
    register(t);

    expect([...SCOPES].sort()).toEqual(
      Object.keys(RATE_LIMIT_PER_MINUTE).sort(),
    );

    for (const [index, scope] of SCOPES.entries()) {
      const nibble = ['a', 'b', 'c'][index];
      if (nibble === undefined) throw new Error('missing bucket key');
      const key = bucketKey(nibble);
      const rate = RATE_LIMIT_PER_MINUTE[scope];

      for (let spent = 0; spent < rate; spent += 1) {
        const verdict = await t.mutation(api.rateLimit.consume, {
          serviceKey: SERVICE_KEY,
          scope,
          key,
        });
        expect(verdict.allowed, `${scope} request ${spent + 1}`).toBe(true);
      }

      const blocked = await t.mutation(api.rateLimit.consume, {
        serviceKey: SERVICE_KEY,
        scope,
        key,
      });
      expect(blocked.allowed, scope).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      for (const other of SCOPES) {
        if (other === scope) continue;
        const verdict = await t.mutation(api.rateLimit.consume, {
          serviceKey: SERVICE_KEY,
          scope: other,
          key,
        });
        expect(verdict.allowed, `${other} after ${scope} was exhausted`).toBe(
          true,
        );
      }

      const stillBlocked = await t.mutation(api.rateLimit.consume, {
        serviceKey: SERVICE_KEY,
        scope,
        key,
      });
      expect(stillBlocked.allowed, `${scope} stays exhausted`).toBe(false);
    }
  });
});
