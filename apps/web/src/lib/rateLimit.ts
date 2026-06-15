import crypto from 'node:crypto';

import type { NextRequest } from 'next/server';

import { hitConvexRateLimit } from '@synac/db';

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

function getWindowStart(windowSeconds: number, nowMs: number): Date {
  const windowMs = windowSeconds * 1000;
  const startMs = nowMs - (nowMs % windowMs);
  return new Date(startMs);
}

export async function enforceRateLimit(input: {
  request: NextRequest;
  scope: string;
  limit: number;
  windowSeconds: number;
  key?: string;
}): Promise<{ allowed: boolean; retryAfterSeconds: number; remaining: number }> {
  const limit = Math.max(1, Math.floor(input.limit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
  const nowMs = Date.now();
  const windowStart = getWindowStart(windowSeconds, nowMs);

  const key = input.key?.trim() ? input.key.trim() : getRateLimitKey(input.request);

  const bucket = await hitConvexRateLimit({ scope: input.scope, key, windowStart });

  const elapsedSeconds = Math.floor((nowMs - windowStart.getTime()) / 1000);
  const retryAfterSeconds = Math.max(0, windowSeconds - elapsedSeconds);
  const remaining = Math.max(0, limit - bucket.count);

  return { allowed: bucket.count <= limit, retryAfterSeconds, remaining };
}
