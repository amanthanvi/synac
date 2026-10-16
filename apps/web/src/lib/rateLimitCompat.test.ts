import { describe, expect, test, vi } from 'vitest';

import { LEGACY_SHARED_SCOPE } from '../../../../convex/rateLimitPolicy';
import {
  isLegacyScopeRejection,
  withLegacyScopeFallback,
} from './rateLimitCompat';

const LEGACY_REJECTION = new Error(
  [
    'ArgumentValidationError: Value does not match validator.',
    'Path: .scope',
    'Value: "search"',
    'Validator: v.literal("api_v1_search")',
  ].join('\n'),
);

describe('isLegacyScopeRejection', () => {
  test('matches a Convex scope-validator rejection', () => {
    expect(isLegacyScopeRejection(LEGACY_REJECTION)).toBe(true);
  });

  test('ignores other limiter failures', () => {
    expect(isLegacyScopeRejection(new Error('Unauthorized'))).toBe(false);
    expect(isLegacyScopeRejection(new Error('Invalid rate limit key'))).toBe(
      false,
    );
    expect(isLegacyScopeRejection(new Error('fetch failed'))).toBe(false);
    expect(isLegacyScopeRejection('ArgumentValidationError .scope')).toBe(
      false,
    );
  });
});

describe('withLegacyScopeFallback', () => {
  test('returns the split-scope verdict when the backend accepts it', async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: true });
    await expect(withLegacyScopeFallback('search', consume)).resolves.toEqual({
      allowed: true,
    });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith('search');
  });

  test('retries the pre-split scope when the backend rejects the new name', async () => {
    const consume = vi
      .fn()
      .mockRejectedValueOnce(LEGACY_REJECTION)
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    await expect(withLegacyScopeFallback('api_read', consume)).resolves.toEqual(
      { allowed: true, retryAfterSeconds: 0 },
    );
    expect(consume).toHaveBeenNthCalledWith(1, 'api_read');
    expect(consume).toHaveBeenNthCalledWith(2, LEGACY_SHARED_SCOPE);
  });

  test('does not hide a failure of the legacy scope or an unrelated error', async () => {
    const unrelated = vi.fn().mockRejectedValue(new Error('Unauthorized'));
    await expect(
      withLegacyScopeFallback('csp_report', unrelated),
    ).rejects.toThrow('Unauthorized');
    expect(unrelated).toHaveBeenCalledTimes(1);

    const legacyDown = vi
      .fn()
      .mockRejectedValueOnce(LEGACY_REJECTION)
      .mockRejectedValueOnce(new Error('limiter down'));
    await expect(withLegacyScopeFallback('search', legacyDown)).rejects.toThrow(
      'limiter down',
    );
    expect(legacyDown).toHaveBeenNthCalledWith(2, LEGACY_SHARED_SCOPE);
  });
});
