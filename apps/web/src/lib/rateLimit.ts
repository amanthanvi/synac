import crypto from 'node:crypto';

import type { NextRequest } from 'next/server';

import { api, getConvexClient, getServiceKey } from './convex';

const SESSION_COOKIE = 'synac_session';

function hash(value: string): string {
  const salt = process.env.SYNAC_RATE_LIMIT_SALT ?? process.env.SYNAC_SESSION_HASH_SALT ?? 'dev';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const fromForwarded = forwarded?.split(',')[0]?.trim();
  if (fromForwarded) return fromForwarded;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

function getRateLimitKey(request: NextRequest): string {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) return `session:${hash(sessionId)}`;

  const ip = getClientIp(request);
  if (ip) return `ip:${hash(ip)}`;

  const ua = request.headers.get('user-agent') ?? '';
  return `ua:${hash(ua)}`;
}

/** Limits per scope are configured in convex/rateLimit.ts. */
export async function enforceRateLimit(input: {
  request: NextRequest;
  scope: 'api_v1_search' | 'api_v1_view';
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return getConvexClient().mutation(api.rateLimit.consume, {
    serviceKey: getServiceKey(),
    scope: input.scope,
    key: getRateLimitKey(input.request),
  });
}
