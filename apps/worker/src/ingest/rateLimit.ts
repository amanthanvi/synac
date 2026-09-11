import type { Prisma } from '@synac/db';

/**
 * Per-host request pacing derived from `Source.rateLimitPolicy`.
 *
 * A single in-process map of "earliest time the next request to this host may
 * start". The worker fetches sequentially inside a run, so a minimum
 * inter-request delay is enough to honour a `requestsPerMinute` budget without
 * a token bucket.
 */
export type RateLimitPolicy = {
  /** `null` means "no declared budget", so no delay is applied. */
  requestsPerMinute: number | null;
};

const MAX_DELAY_MS = 60_000;

const nextAllowedAtByHost = new Map<string, number>();

export function parseRateLimitPolicy(
  value: Prisma.JsonValue | undefined,
): RateLimitPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { requestsPerMinute: null };
  }

  const n = Number(value.requestsPerMinute);
  if (!Number.isFinite(n) || n <= 0) return { requestsPerMinute: null };

  return { requestsPerMinute: Math.min(6000, Math.floor(n)) };
}

/** Minimum milliseconds between two requests to the same host. */
export function minDelayMsFor(policy: RateLimitPolicy): number {
  if (policy.requestsPerMinute === null) return 0;
  return Math.min(MAX_DELAY_MS, Math.ceil(60_000 / policy.requestsPerMinute));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Blocks until this host's next slot is free, then reserves the following one.
 * A no-op when the source declares no budget.
 */
export async function waitForRateLimitSlot(
  host: string,
  policy: RateLimitPolicy,
): Promise<number> {
  const delayMs = minDelayMsFor(policy);
  if (delayMs <= 0) return 0;

  const key = host.trim().toLowerCase();
  const now = Date.now();
  const nextAllowedAt = nextAllowedAtByHost.get(key) ?? 0;
  const waitMs = Math.max(0, nextAllowedAt - now);

  nextAllowedAtByHost.set(key, Math.max(now, nextAllowedAt) + delayMs);

  if (waitMs > 0) await sleep(waitMs);

  return waitMs;
}

/** Test seam. */
export function resetRateLimiter(): void {
  nextAllowedAtByHost.clear();
}
