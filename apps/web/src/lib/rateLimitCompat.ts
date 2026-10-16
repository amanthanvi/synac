import {
  LEGACY_SHARED_SCOPE,
  type RateLimitScope,
} from '../../../../convex/rateLimitPolicy';

/**
 * Convex rejects a scope a deployment does not list in the `consume` args
 * validator before the handler runs. That failure names the field:
 *
 * ArgumentValidationError: Value does not match validator.
 * Path: .scope
 *
 * A service-key failure, a bad bucket key, and a down limiter do not.
 */
export function isLegacyScopeRejection(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('ArgumentValidationError') &&
    error.message.includes('.scope')
  );
}

/**
 * Tries the split scope, then the pre-split name. The second call happens
 * only when this web deploy is talking to a backend that has not caught up.
 * Validation fails before a token is spent, so the retry does not double-charge.
 */
export async function withLegacyScopeFallback<T>(
  scope: RateLimitScope,
  consume: (scope: RateLimitScope | typeof LEGACY_SHARED_SCOPE) => Promise<T>,
): Promise<T> {
  try {
    return await consume(scope);
  } catch (error) {
    if (!isLegacyScopeRejection(error)) throw error;
    return consume(LEGACY_SHARED_SCOPE);
  }
}
