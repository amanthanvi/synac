import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  deriveRateLimitKey,
  enforcePageRateLimit,
  enforceRateLimit,
  RATE_LIMIT_KEY_PATTERN,
} from './rateLimit';

const consumeRateLimit = vi.hoisted(() => vi.fn());

vi.mock('./convex', () => ({
  consumeRateLimit,
}));

beforeEach(() => {
  consumeRateLimit.mockReset();
});

afterEach(() => {
  delete process.env.SYNAC_TRUSTED_PROXY_HOPS;
});

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('deriveRateLimitKey', () => {
  test('takes the rightmost forwarded address by default', () => {
    const key = deriveRateLimitKey(
      headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }),
    );
    expect(key).toMatch(RATE_LIMIT_KEY_PATTERN);
    expect(key).toBe(
      deriveRateLimitKey(headers({ 'x-forwarded-for': '9.9.9.9, 3.3.3.3' })),
    );
  });

  test('honours extra trusted proxy hops', () => {
    process.env.SYNAC_TRUSTED_PROXY_HOPS = '2';
    const key = deriveRateLimitKey(
      headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }),
    );
    expect(key).toBe(
      deriveRateLimitKey(headers({ 'x-forwarded-for': '2.2.2.2, 0.0.0.0' })),
    );
  });

  test('falls back to a user-agent bucket', () => {
    const key = deriveRateLimitKey(headers({ 'user-agent': 'curl/8' }));
    expect(key.startsWith('ua:')).toBe(true);
    expect(key).toMatch(RATE_LIMIT_KEY_PATTERN);
  });

  test('always produces a key Convex accepts', () => {
    expect(deriveRateLimitKey(headers({}))).toMatch(RATE_LIMIT_KEY_PATTERN);
    expect(deriveRateLimitKey(headers({ 'x-forwarded-for': ' , , ' }))).toMatch(
      RATE_LIMIT_KEY_PATTERN,
    );
  });
});

describe('enforceRateLimit', () => {
  test.each(['search', 'api_read', 'csp_report'] as const)(
    'charges the %s scope and returns the verdict',
    async (scope) => {
      consumeRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 7,
      });
      const verdict = await enforceRateLimit(
        headers({ 'x-forwarded-for': '203.0.113.9' }),
        scope,
      );
      expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 7 });
      expect(consumeRateLimit).toHaveBeenCalledWith(
        expect.stringMatching(RATE_LIMIT_KEY_PATTERN),
        scope,
      );
    },
  );

  test('the search page spends the search scope and fails open when the limiter is down', async () => {
    consumeRateLimit.mockRejectedValueOnce(new Error('limiter down'));
    const verdict = await enforcePageRateLimit(
      headers({ 'x-forwarded-for': '203.0.113.9' }),
    );
    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(RATE_LIMIT_KEY_PATTERN),
      'search',
    );
  });
});
