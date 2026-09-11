import crypto from 'node:crypto';

import { getPrismaClient } from '@synac/db';

import { requireSalt } from './secrets';

// `requireSalt` throws on first use in production when the salt is unset, so a
// misconfigured deploy fails on its first rate-limited request instead of
// hashing with a guessable value. The check is not done at import time because
// `next build` also runs with NODE_ENV=production.

/** Anything with a Headers-shaped `get`: `Request`, `NextRequest`, `await headers()`. */
export type HeadersLike = { get(name: string): string | null };

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
};

/**
 * Fraction of the limit a single process may serve from its in-memory window
 * before it starts writing to the shared bucket. Under normal traffic this
 * keeps the hot path free of a DB round trip; the DB is only consulted once a
 * caller looks like it might actually approach the limit.
 */
const LOCAL_PRECHECK_FRACTION = 0.25;

/** Cap on distinct keys held in the process-local window, to bound memory. */
const LOCAL_MAX_KEYS = 20_000;

function hash(value: string): string {
  const salt = requireSalt('SYNAC_RATE_LIMIT_SALT');
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

/**
 * Number of proxies we operate in front of the app. The client address is the
 * `hops`-th entry counted from the *right* of `x-forwarded-for`: the rightmost
 * entry was written by our own nearest trusted proxy and therefore cannot be
 * forged by the client, whereas the leftmost entry is whatever the client sent.
 * Default 1 = a single trusted proxy (Railway/Vercel/Cloudflare style).
 */
function getTrustedProxyHops(): number {
  const raw = process.env.SYNAC_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(10, parsed);
}

function isPlausibleIp(value: string): boolean {
  if (!value) return false;
  if (value.length > 45) return false;
  // IPv4, IPv4-mapped IPv6, and IPv6 (including the bracketed `[::1]:443` form).
  return /^[0-9a-fA-F:.\[\]]+$/.test(value);
}

function normalizeIp(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;

  // `[2001:db8::1]:443` -> `2001:db8::1`
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed?.[1]) candidate = bracketed[1];
  // `203.0.113.4:51234` -> `203.0.113.4` (never strip an IPv6 colon)
  else if (
    candidate.includes(':') &&
    !candidate.includes('::') &&
    candidate.split(':').length === 2
  ) {
    const [host] = candidate.split(':');
    if (host && host.includes('.')) candidate = host;
  }

  candidate = candidate.toLowerCase();
  return isPlausibleIp(candidate) ? candidate : null;
}

/**
 * Client IP derived only from headers our own proxy layer controls. We never
 * key on a client-supplied cookie: a cookie is trivially rotated, so cookie
 * keying let a single client mint unlimited buckets.
 */
export function getClientIp(headers: HeadersLike): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const list = forwarded
      .split(',')
      .map((part) => normalizeIp(part))
      .filter((part): part is string => part !== null);

    if (list.length > 0) {
      const hops = getTrustedProxyHops();
      const index = Math.max(0, list.length - hops);
      const picked = list[index] ?? list[list.length - 1];
      if (picked) return picked;
    }
  }

  const realIp = normalizeIp(headers.get('x-real-ip') ?? '');
  if (realIp) return realIp;

  return null;
}

function getRateLimitKey(headers: HeadersLike): string {
  const ip = getClientIp(headers);
  if (ip) return `ip:${hash(ip)}`;

  // Last resort for direct/local traffic with no proxy headers at all. Coarse
  // on purpose: it is a shared bucket, not a per-client one.
  const ua = headers.get('user-agent') ?? '';
  return `ua:${hash(ua)}`;
}

function getWindowStart(windowSeconds: number, nowMs: number): Date {
  const windowMs = windowSeconds * 1000;
  const startMs = nowMs - (nowMs % windowMs);
  return new Date(startMs);
}

type LocalWindow = { hits: number[] };

const localWindows = new Map<string, LocalWindow>();
let lastPruneMs = 0;

function pruneLocalWindows(nowMs: number, windowMs: number): void {
  // Amortised: sweep at most once per window, or immediately if we are at the cap.
  if (nowMs - lastPruneMs < windowMs && localWindows.size < LOCAL_MAX_KEYS)
    return;
  lastPruneMs = nowMs;

  for (const [key, window] of localWindows) {
    const cutoff = nowMs - windowMs;
    const kept = window.hits.filter((t) => t > cutoff);
    if (kept.length === 0) localWindows.delete(key);
    else window.hits = kept;
  }

  if (localWindows.size >= LOCAL_MAX_KEYS) {
    // Still over budget after pruning: drop the oldest insertions (Map keeps
    // insertion order) so a burst of distinct keys cannot grow unbounded.
    const overflow = localWindows.size - Math.floor(LOCAL_MAX_KEYS / 2);
    let dropped = 0;
    for (const key of localWindows.keys()) {
      if (dropped >= overflow) break;
      localWindows.delete(key);
      dropped += 1;
    }
  }
}

/** Record a hit in the process-local sliding window and return the current count. */
function recordLocalHit(key: string, nowMs: number, windowMs: number): number {
  pruneLocalWindows(nowMs, windowMs);

  const cutoff = nowMs - windowMs;
  const existing = localWindows.get(key);
  if (!existing) {
    localWindows.set(key, { hits: [nowMs] });
    return 1;
  }

  existing.hits = existing.hits.filter((t) => t > cutoff);
  existing.hits.push(nowMs);
  return existing.hits.length;
}

/** Test seam: drop all process-local counters. */
export function resetLocalRateLimitWindows(): void {
  localWindows.clear();
  lastPruneMs = 0;
}

type EnforceRateLimitInput = {
  /** Any request-ish object; only its headers are read. */
  request?: HeadersLike | { headers: HeadersLike };
  /** Pre-extracted headers (e.g. `await headers()` inside a page). */
  headers?: HeadersLike;
  scope: string;
  limit: number;
  windowSeconds: number;
  /** Explicit bucket key, bypassing IP derivation. */
  key?: string;
};

function resolveHeaders(input: EnforceRateLimitInput): HeadersLike {
  if (input.headers) return input.headers;

  const request = input.request;
  if (!request) return new Headers();

  if ('headers' in request) {
    return typeof request.headers?.get === 'function'
      ? request.headers
      : new Headers();
  }

  return typeof request.get === 'function' ? request : new Headers();
}

export async function enforceRateLimit(
  input: EnforceRateLimitInput,
): Promise<RateLimitDecision> {
  const limit = Math.max(1, Math.floor(input.limit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
  const windowMs = windowSeconds * 1000;
  const nowMs = Date.now();
  const windowStart = getWindowStart(windowSeconds, nowMs);

  const headers = resolveHeaders(input);
  const key = input.key?.trim() ? input.key.trim() : getRateLimitKey(headers);

  const elapsedSeconds = Math.floor((nowMs - windowStart.getTime()) / 1000);
  const retryAfterSeconds = Math.max(0, windowSeconds - elapsedSeconds);

  const localCount = recordLocalHit(`${input.scope}:${key}`, nowMs, windowMs);
  const precheckCeiling = Math.max(
    1,
    Math.floor(limit * LOCAL_PRECHECK_FRACTION),
  );

  if (localCount <= precheckCeiling) {
    // Well below the limit for this process; skip the shared bucket entirely.
    return {
      allowed: true,
      retryAfterSeconds,
      remaining: Math.max(0, limit - localCount),
      limit,
    };
  }

  const prisma = getPrismaClient();
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { scope_key_windowStart: { scope: input.scope, key, windowStart } },
    create: { scope: input.scope, key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  // The shared bucket under-counts by the hits this process served locally, so
  // take whichever counter is higher.
  const count = Math.max(bucket.count, localCount);

  return {
    allowed: count <= limit,
    retryAfterSeconds,
    remaining: Math.max(0, limit - count),
    limit,
  };
}

/**
 * Rate limit for a server-rendered page. Pages cannot take a `Request`, so they
 * pass `await headers()`.
 *
 * NOTE for the `/search` page owner: call this at the top of the page component
 * and render a "slow down" state when `allowed` is false.
 */
export async function enforcePageRateLimit(
  headersLike: HeadersLike,
  input?: { scope?: string; limit?: number; windowSeconds?: number },
): Promise<RateLimitDecision> {
  return enforceRateLimit({
    headers: headersLike,
    scope: input?.scope ?? 'page_search',
    limit: input?.limit ?? 120,
    windowSeconds: input?.windowSeconds ?? 60,
  });
}

/** Standard `x-ratelimit-*` headers for a decision. */
export function rateLimitHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  return {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
  };
}
