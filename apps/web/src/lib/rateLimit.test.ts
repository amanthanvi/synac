import '../test.setup';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import {
  enforceRateLimit,
  getClientIp,
  resetLocalRateLimitWindows,
} from './rateLimit';

const prisma = createIntegrationTestClient();

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

/** A request-ish object shaped like `NextRequest`, including a cookie jar. */
function requestWith(init: {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}): { headers: Headers } {
  const merged: Record<string, string> = { ...init.headers };
  const cookies = Object.entries(init.cookies ?? {});
  if (cookies.length) {
    merged.cookie = cookies
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
  return { headers: headers(merged) };
}

describe('getClientIp', () => {
  const original = process.env.SYNAC_TRUSTED_PROXY_HOPS;

  afterAll(() => {
    if (original === undefined) delete process.env.SYNAC_TRUSTED_PROXY_HOPS;
    else process.env.SYNAC_TRUSTED_PROXY_HOPS = original;
  });

  it('takes the rightmost forwarded address with the default single trusted proxy', () => {
    delete process.env.SYNAC_TRUSTED_PROXY_HOPS;

    // The client can put anything it likes at the left of x-forwarded-for; only
    // the rightmost entry was written by our own proxy.
    expect(getClientIp(headers({ 'x-forwarded-for': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(
      getClientIp(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })),
    ).toBe('203.0.113.9');
  });

  it('walks back one further address per configured proxy hop', () => {
    process.env.SYNAC_TRUSTED_PROXY_HOPS = '2';

    expect(
      getClientIp(
        headers({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9, 10.0.0.1' }),
      ),
    ).toBe('203.0.113.9');
  });

  it('never walks past the start of the list', () => {
    process.env.SYNAC_TRUSTED_PROXY_HOPS = '5';

    expect(getClientIp(headers({ 'x-forwarded-for': '198.51.100.7' }))).toBe(
      '198.51.100.7',
    );
  });

  it('falls back to x-real-ip and strips ports and brackets', () => {
    delete process.env.SYNAC_TRUSTED_PROXY_HOPS;

    expect(getClientIp(headers({ 'x-real-ip': '198.51.100.5' }))).toBe(
      '198.51.100.5',
    );
    expect(
      getClientIp(headers({ 'x-forwarded-for': '203.0.113.9:51234' })),
    ).toBe('203.0.113.9');
    expect(
      getClientIp(headers({ 'x-forwarded-for': '[2001:db8::1]:443' })),
    ).toBe('2001:db8::1');
  });

  it('returns null when no proxy header is present', () => {
    expect(getClientIp(headers({ 'user-agent': 'vitest' }))).toBeNull();
  });
});

describe('enforceRateLimit', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    resetLocalRateLimitWindows();
    delete process.env.SYNAC_TRUSTED_PROXY_HOPS;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('serves the first quarter of the limit from memory without touching the database', async () => {
    const request = requestWith({
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });

    for (let i = 0; i < 5; i++) {
      const decision = await enforceRateLimit({
        request,
        scope: 'test_precheck',
        limit: 20,
        windowSeconds: 60,
      });
      expect(decision.allowed).toBe(true);
    }

    expect(
      await prisma.rateLimitBucket.count({ where: { scope: 'test_precheck' } }),
    ).toBe(0);

    // The sixth request crosses 25% of the limit, so the shared bucket appears.
    await enforceRateLimit({
      request,
      scope: 'test_precheck',
      limit: 20,
      windowSeconds: 60,
    });
    expect(
      await prisma.rateLimitBucket.count({ where: { scope: 'test_precheck' } }),
    ).toBe(1);
  });

  it('refuses once the window limit is exceeded and reports remaining along the way', async () => {
    const request = requestWith({
      headers: { 'x-forwarded-for': '203.0.113.21' },
    });

    const decisions = [];
    for (let i = 0; i < 5; i++) {
      decisions.push(
        await enforceRateLimit({
          request,
          scope: 'test_window',
          limit: 4,
          windowSeconds: 60,
        }),
      );
    }

    expect(decisions.slice(0, 4).every((d) => d.allowed)).toBe(true);
    expect(decisions[4]?.allowed).toBe(false);
    expect(decisions[3]?.remaining).toBe(0);
    expect(decisions[0]?.limit).toBe(4);
    expect(decisions[4]?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys on the client IP, so rotating a cookie does not mint a fresh bucket', async () => {
    const scope = 'test_cookie_ignored';

    for (let i = 0; i < 6; i++) {
      await enforceRateLimit({
        request: requestWith({
          headers: { 'x-forwarded-for': '203.0.113.22' },
          // A different session cookie on every request: under cookie keying
          // this was a free reset.
          cookies: { synac_session: `rotated-${i}` },
        }),
        scope,
        limit: 4,
        windowSeconds: 60,
      });
    }

    const buckets = await prisma.rateLimitBucket.findMany({ where: { scope } });
    expect(buckets).toHaveLength(1);

    const last = await enforceRateLimit({
      request: requestWith({
        headers: { 'x-forwarded-for': '203.0.113.22' },
        cookies: { synac_session: 'yet-another' },
      }),
      scope,
      limit: 4,
      windowSeconds: 60,
    });
    expect(last.allowed).toBe(false);
  });

  it('gives distinct client IPs distinct buckets', async () => {
    const scope = 'test_distinct_ips';

    for (const ip of ['203.0.113.30', '203.0.113.31']) {
      for (let i = 0; i < 6; i++) {
        await enforceRateLimit({
          request: requestWith({ headers: { 'x-forwarded-for': ip } }),
          scope,
          limit: 8,
          windowSeconds: 60,
        });
      }
    }

    expect(await prisma.rateLimitBucket.count({ where: { scope } })).toBe(2);
  });

  it('hashes the bucket key, so a raw IP is never stored', async () => {
    const scope = 'test_hashed_key';

    for (let i = 0; i < 6; i++) {
      await enforceRateLimit({
        request: requestWith({
          headers: { 'x-forwarded-for': '203.0.113.40' },
        }),
        scope,
        limit: 8,
        windowSeconds: 60,
      });
    }

    const bucket = await prisma.rateLimitBucket.findFirst({ where: { scope } });
    expect(bucket?.key).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(bucket?.key).not.toContain('203.0.113.40');
  });
});
