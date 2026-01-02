import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'synac_session';

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
  const rate = await enforceRateLimit({ request, scope: 'api_v1_view', limit: 120, windowSeconds: 60 });
  if (!rate.allowed) {
    const requestId = request.headers.get('x-request-id');
    return NextResponse.json(
      { ok: false, error: 'rate_limited', requestId, retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const entryId = (body as { entryId?: unknown }).entryId;
  if (!isUuid(entryId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const prisma = getPrismaClient();
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, status: 'PUBLISHED', deletedAt: null },
    select: { id: true },
  });

  if (!entry) {
    return NextResponse.json({ ok: true });
  }

  const sessionHash = hashSession(sessionId);
  await prisma.entryView.upsert({
    where: { entryId_sessionHash: { entryId, sessionHash } },
    create: { entryId, sessionHash, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
