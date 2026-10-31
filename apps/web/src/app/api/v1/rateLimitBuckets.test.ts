/**
 * The counters live in the test double, keyed by the scope each route passes.
 * A route that charges the wrong scope makes the wrong response 429. The
 * Convex suite checks that the real limiter keeps those scopes independent.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { RATE_LIMIT_PER_MINUTE } from '../../../../../../convex/rateLimitPolicy';
import { POST as reportCsp } from './csp-report/route';
import { GET as search } from './search/route';
import { GET as terms } from './terms/route';

const buckets = vi.hoisted(() => ({
  used: new Map<string, number>(),
}));

vi.mock('@/lib/convex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/convex')>();
  const { RATE_LIMIT_PER_MINUTE: limits } =
    await import('../../../../../../convex/rateLimitPolicy');
  return {
    ...actual,
    consumeRateLimit: async (key: string, scope: keyof typeof limits) => {
      const limit = limits[scope];
      const id = `${scope}:${key}`;
      const next = (buckets.used.get(id) ?? 0) + 1;
      buckets.used.set(id, next);
      if (next > limit) return { allowed: false, retryAfterSeconds: 30 };
      return { allowed: true, retryAfterSeconds: 0 };
    },
    readBrowsePage: async () => ({
      activeTag: null,
      tags: [],
      entries: [],
      totalMatches: 0,
      hasMore: false,
    }),
  };
});

beforeEach(() => {
  buckets.used.clear();
});

function request(path: string, address: string, method = 'GET'): Request {
  return new Request(`https://synac.app${path}`, {
    method,
    headers: { 'x-forwarded-for': address },
  });
}

async function exhaust(
  address: string,
  send: (address: string) => Promise<Response>,
  limit: number,
): Promise<Response> {
  for (let spent = 0; spent < limit; spent += 1) {
    const response = await send(address);
    expect(response.status, `request ${spent + 1}`).not.toBe(429);
  }
  return send(address);
}

describe('per-route rate limit buckets', () => {
  test('exhausting search still serves terms and CSP reports', async () => {
    const address = '203.0.113.10';
    const blocked = await exhaust(
      address,
      (client) => search(request('/api/v1/search', client)),
      RATE_LIMIT_PER_MINUTE.search,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('30');
    expect(await blocked.json()).toMatchObject({ error: 'rate_limited' });

    const listing = await terms(request('/api/v1/terms', address));
    expect(listing.status).toBe(200);

    const report = await reportCsp(
      request('/api/v1/csp-report', address, 'POST'),
    );
    expect(report.status).toBe(204);
  });

  test('exhausting terms still serves search and CSP reports', async () => {
    const address = '203.0.113.11';
    const blocked = await exhaust(
      address,
      (client) => terms(request('/api/v1/terms', client)),
      RATE_LIMIT_PER_MINUTE.api_read,
    );
    expect(blocked.status).toBe(429);

    const found = await search(request('/api/v1/search', address));
    expect(found.status).toBe(200);

    const report = await reportCsp(
      request('/api/v1/csp-report', address, 'POST'),
    );
    expect(report.status).toBe(204);
  });

  test('exhausting CSP reports still serves search and terms', async () => {
    const address = '203.0.113.12';
    const blocked = await exhaust(
      address,
      (client) => reportCsp(request('/api/v1/csp-report', client, 'POST')),
      RATE_LIMIT_PER_MINUTE.csp_report,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('30');
    expect(await blocked.text()).toBe('');

    const found = await search(request('/api/v1/search', address));
    expect(found.status).toBe(200);
    const listing = await terms(request('/api/v1/terms', address));
    expect(listing.status).toBe(200);
  });
});
