import crypto from 'node:crypto';

import type { RateLimitScope } from '../../../../convex/rateLimitPolicy';
import { consumeRateLimit } from './convex';

export type { RateLimitScope };

/** Convex rejects anything else, so the derivation below must always match. */
export const RATE_LIMIT_KEY_PATTERN = /^(ip|ua):[a-f0-9]{64}$/;

const DEV_SALT = 'synac-dev-rate-limit-salt';

let salt: string | null = null;

function getSalt(): string {
  if (salt) return salt;
  const configured = process.env.SYNAC_RATE_LIMIT_SALT?.trim();
  if (configured) {
    salt = configured;
    return salt;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SYNAC_RATE_LIMIT_SALT is not configured');
  }
  salt = DEV_SALT;
  return salt;
}

function trustedProxyHops(): number {
  const configured = Math.floor(
    Number(process.env.SYNAC_TRUSTED_PROXY_HOPS ?? 1),
  );
  return Number.isFinite(configured) && configured >= 1 ? configured : 1;
}

/**
 * The client address is the entry `SYNAC_TRUSTED_PROXY_HOPS` from the right of
 * x-forwarded-for: everything to its right was appended by infrastructure we
 * operate, everything to its left is caller-supplied and forgeable. Buckets are
 * keyed by a salted hash so no raw address reaches the database.
 */
export function deriveRateLimitKey(headers: Headers): string {
  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const address = forwarded[forwarded.length - trustedProxyHops()];
  if (address) return `ip:${hash(address)}`;
  return `ua:${hash(headers.get('user-agent') ?? '')}`;
}

function hash(value: string): string {
  return crypto
    .createHash('sha256')
    .update(`${getSalt()}:${value}`)
    .digest('hex');
}

type RateLimitVerdict = { allowed: boolean; retryAfterSeconds: number };

/** Limits per scope are configured in convex/rateLimitPolicy.ts. */
export async function enforceRateLimit(
  headers: Headers,
  scope: RateLimitScope,
): Promise<RateLimitVerdict> {
  return consumeRateLimit(deriveRateLimitKey(headers), scope);
}

/**
 * Search page variant. It spends the same `search` budget as GET /api/v1/search.
 * A limiter that is unreachable must not turn a reader's search into a 500, so
 * an error here fails open and only a real refusal blocks.
 */
export async function enforcePageRateLimit(
  headers: Headers,
): Promise<RateLimitVerdict> {
  try {
    return await enforceRateLimit(headers, 'search');
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
