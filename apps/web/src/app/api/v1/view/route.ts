import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { trackPublishedEntryView } from '@synac/db';

import { logger } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'synac_session';
const VIEW_UPDATE_MIN_INTERVAL_MS = 30 * 60 * 1000;

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function hashSession(sessionId: string): string {
  const salt = process.env.SYNAC_SESSION_HASH_SALT ?? 'dev';
  return crypto.createHash('sha256').update(`${salt}:${sessionId}`).digest('hex');
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    const rate = await enforceRateLimit({ request, scope: 'api_v1_view', limit: 120, windowSeconds: 60 });
    if (!rate.allowed) {
      logger.warn('api.view.rate_limited', { requestId, retryAfterSeconds: rate.retryAfterSeconds });
      return NextResponse.json(
        { ok: false, error: 'rate_limited', requestId, retryAfterSeconds: rate.retryAfterSeconds },
        { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
      );
    }

    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing_session', requestId }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json', requestId }, { status: 400 });
    }

    const entryId = (body as { entryId?: unknown }).entryId;
    if (!isUuid(entryId)) {
      return NextResponse.json({ ok: false, error: 'invalid_entry_id', requestId }, { status: 400 });
    }

    const sessionHash = hashSession(sessionId);
    await trackPublishedEntryView({
      entryId,
      sessionHash,
      now: new Date(),
      minIntervalMs: VIEW_UPDATE_MIN_INTERVAL_MS,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('api.view.error', { requestId, error: message });
    return NextResponse.json({ ok: false, error: 'internal_error', requestId }, { status: 500 });
  }
}
