import { afterEach, describe, expect, test } from 'vitest';

import { deriveRateLimitKey, RATE_LIMIT_KEY_PATTERN } from './rateLimit';

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
