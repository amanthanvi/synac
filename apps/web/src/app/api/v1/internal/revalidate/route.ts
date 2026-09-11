import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { revalidateTags } from '@/lib/cacheTags';
import { logger } from '@/lib/logger';
import { getRevalidateSecret } from '@/lib/secrets';
import { parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tags: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
});

/** Constant-time compare, so the secret cannot be recovered by timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * `POST /api/v1/internal/revalidate` is called by the worker after auto-publish,
 * so a freshly published entry is not stuck behind the page cache.
 *
 * Authorization is a shared bearer secret, not a session: the caller is a
 * background process with no user. An unset or too-short secret disables the
 * route entirely rather than leaving it open.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = getRevalidateSecret();
  if (!expected) {
    logger.warn('api.internal.revalidate.disabled');
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : '';
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const applied = revalidateTags(body.data.tags);
  logger.info('api.internal.revalidate.ok', {
    requested: body.data.tags.length,
    applied: applied.length,
  });

  return NextResponse.json({ ok: true, revalidated: applied });
}
