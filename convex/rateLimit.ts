import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import { components } from './_generated/api';
import { mutation } from './_generated/server';
import { requireServiceKey } from './lib/serviceKey';
import { RATE_LIMIT_PER_MINUTE } from './rateLimitPolicy';

const limiter = new RateLimiter(components.rateLimiter, {
  search: {
    kind: 'fixed window',
    rate: RATE_LIMIT_PER_MINUTE.search,
    period: MINUTE,
  },
  api_read: {
    kind: 'fixed window',
    rate: RATE_LIMIT_PER_MINUTE.api_read,
    period: MINUTE,
  },
  csp_report: {
    kind: 'fixed window',
    rate: RATE_LIMIT_PER_MINUTE.csp_report,
    period: MINUTE,
  },
});

/** Buckets are keyed by a hash of the caller's IP or user agent, never by a raw value. */
const BUCKET_KEY = /^(ip|ua):[a-f0-9]{64}$/;

/**
 * Consumes one token from a per-caller bucket for one route class.
 *
 * Trust boundary: this is a public mutation, so anyone on the internet can
 * reach it, but the service key gates it to the Next.js server and the key
 * shape gates which bucket a caller may spend. Without both, an attacker could
 * drain another visitor's budget by naming their bucket. `scope` selects which
 * of the independent budgets in `rateLimitPolicy.ts` is spent.
 */
export const consume = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.union(
      v.literal('search'),
      v.literal('api_read'),
      v.literal('csp_report'),
    ),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServiceKey(args.serviceKey);
    if (!BUCKET_KEY.test(args.key)) throw new Error('Invalid rate limit key');
    const status = await limiter.limit(ctx, args.scope, { key: args.key });
    return {
      allowed: status.ok,
      retryAfterSeconds: status.ok
        ? 0
        : Math.max(1, Math.ceil((status.retryAfter ?? 1000) / 1000)),
    };
  },
});
