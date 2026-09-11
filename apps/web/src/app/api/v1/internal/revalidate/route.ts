import crypto from 'node:crypto';

import { revalidateTag } from 'next/cache';

import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** Below this a secret is treated as unset, and the route stays invisible. */
const MIN_SECRET_LENGTH = 16;
const MAX_TAGS = 20;
const TAG_PATTERN = /^[a-zA-Z0-9:_-]{1,100}$/;

type RevalidateBody = { error: string } | { ok: true; tags: string[] };

function jsonResponse(body: RevalidateBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function bearerMatches(header: string | null, secret: string): boolean {
  const [scheme, ...rest] = (header ?? '').trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return false;
  const provided = Buffer.from(rest.join(' '), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  // timingSafeEqual throws on a length mismatch, and the length of a secret is
  // not itself a secret worth protecting here.
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function parseTags(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null || !('tags' in payload)) {
    return null;
  }
  const tags = payload.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAGS) {
    return null;
  }
  const parsed: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string' || !TAG_PATTERN.test(tag.trim())) return null;
    parsed.push(tag.trim());
  }
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SYNAC_REVALIDATE_SECRET ?? '';
  // An unconfigured deployment must not advertise that this endpoint exists.
  if (secret.length < MIN_SECRET_LENGTH) {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const tags = parseTags(payload);
  if (!tags) return jsonResponse({ error: 'invalid_body' }, 400);

  for (const tag of tags) {
    revalidateTag(tag, 'max');
  }
  logger.info('api.revalidate.ok', { tags });

  return jsonResponse({ ok: true, tags }, 200);
}
