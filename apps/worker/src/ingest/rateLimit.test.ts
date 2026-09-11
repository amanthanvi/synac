import { beforeEach, describe, expect, it } from 'vitest';

import {
  minDelayMsFor,
  parseRateLimitPolicy,
  resetRateLimiter,
  waitForRateLimitSlot,
} from './rateLimit.js';
import {
  buildExtractorVersion,
  USER_AGENT,
  WORKER_VERSION,
} from '../version.js';

describe('parseRateLimitPolicy', () => {
  it('reads requestsPerMinute from the source policy', () => {
    expect(parseRateLimitPolicy({ requestsPerMinute: 30 })).toEqual({
      requestsPerMinute: 30,
    });
  });

  it('coerces a numeric string', () => {
    expect(parseRateLimitPolicy({ requestsPerMinute: '12' })).toEqual({
      requestsPerMinute: 12,
    });
  });

  it('floors a fractional budget', () => {
    expect(parseRateLimitPolicy({ requestsPerMinute: 10.9 })).toEqual({
      requestsPerMinute: 10,
    });
  });

  it('treats a missing, null, or malformed policy as no budget', () => {
    expect(parseRateLimitPolicy(null)).toEqual({ requestsPerMinute: null });
    expect(parseRateLimitPolicy(undefined)).toEqual({
      requestsPerMinute: null,
    });
    expect(parseRateLimitPolicy({})).toEqual({ requestsPerMinute: null });
    expect(parseRateLimitPolicy({ requestsPerMinute: 'fast' })).toEqual({
      requestsPerMinute: null,
    });
    expect(parseRateLimitPolicy('60')).toEqual({ requestsPerMinute: null });
  });

  it('rejects a non-positive budget rather than dividing by zero', () => {
    expect(parseRateLimitPolicy({ requestsPerMinute: 0 })).toEqual({
      requestsPerMinute: null,
    });
    expect(parseRateLimitPolicy({ requestsPerMinute: -5 })).toEqual({
      requestsPerMinute: null,
    });
  });
});

describe('minDelayMsFor', () => {
  it('is zero when no budget is declared', () => {
    expect(minDelayMsFor({ requestsPerMinute: null })).toBe(0);
  });

  it('spreads the budget evenly across the minute', () => {
    expect(minDelayMsFor({ requestsPerMinute: 60 })).toBe(1000);
    expect(minDelayMsFor({ requestsPerMinute: 30 })).toBe(2000);
  });

  it('caps the delay at one minute for a budget of one request', () => {
    expect(minDelayMsFor({ requestsPerMinute: 1 })).toBe(60_000);
  });
});

describe('waitForRateLimitSlot', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('does not wait when the source declares no budget', async () => {
    const waited = await waitForRateLimitSlot('example.com', {
      requestsPerMinute: null,
    });
    expect(waited).toBe(0);
  });

  it('lets the first request through immediately', async () => {
    const waited = await waitForRateLimitSlot('example.com', {
      requestsPerMinute: 600,
    });
    expect(waited).toBe(0);
  });

  it('paces the second request to the same host', async () => {
    await waitForRateLimitSlot('example.com', { requestsPerMinute: 600 });
    const waited = await waitForRateLimitSlot('example.com', {
      requestsPerMinute: 600,
    });
    expect(waited).toBeGreaterThan(0);
  });

  it('tracks hosts independently and case-insensitively', async () => {
    await waitForRateLimitSlot('example.com', { requestsPerMinute: 600 });
    expect(
      await waitForRateLimitSlot('other.example', { requestsPerMinute: 600 }),
    ).toBe(0);
    expect(
      await waitForRateLimitSlot('EXAMPLE.COM', { requestsPerMinute: 600 }),
    ).toBeGreaterThan(0);
  });
});

describe('extractor version and user agent', () => {
  it('reads the worker package version', () => {
    expect(WORKER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('builds a user agent from the package version', () => {
    expect(USER_AGENT).toBe(
      `synac-worker/${WORKER_VERSION} (+https://github.com/amanthanvi/synac)`,
    );
  });

  it('stamps the worker version and the adapter revision', () => {
    expect(buildExtractorVersion('nist@2')).toBe(
      `synac-worker/${WORKER_VERSION}+nist@2`,
    );
  });

  it('falls back for a blank adapter version', () => {
    expect(buildExtractorVersion('   ')).toBe(
      `synac-worker/${WORKER_VERSION}+unknown@0`,
    );
  });
});
