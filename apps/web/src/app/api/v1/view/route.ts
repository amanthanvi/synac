import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { api, getConvexClient, getServiceKey } from '@/lib/convex';
import { logger } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'synac_session';
const ENTRY_KEY_PATTERN = /^(TERM|ACRONYM):[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hashSession(sessionId: string): string {
  const salt = process.env.SYNAC_SESSION_HASH_SALT ?? 'dev';
  return crypto.createHash('sha256').update(`${salt}:${sessionId}`).digest('hex');
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    const rate = await enforceRateLimit({ request, scope: 'api_v1_view' });
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

    const entryKey = (body as { entryKey?: unknown }).entryKey;
    if (typeof entryKey !== 'string' || !ENTRY_KEY_PATTERN.test(entryKey)) {
      return NextResponse.json({ ok: false, error: 'invalid_entry_key', requestId }, { status: 400 });
    }

    await getConvexClient().mutation(api.views.trackView, {
      serviceKey: getServiceKey(),
      entryKey,
      sessionHash: hashSession(sessionId),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('api.view.error', { requestId, error: message });
    return NextResponse.json({ ok: false, error: 'internal_error', requestId }, { status: 500 });
  }
}
