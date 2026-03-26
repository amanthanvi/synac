import { NextResponse } from 'next/server';

import { getString, normalizeOptional } from '@synac/shared';

import { requireAdminActor } from '@/lib/admin';
import { updateTag } from '@/lib/adminTags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = normalizeOptional(request.headers.get('x-request-id')) ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const { id: tagId } = await context.params;

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json', requestId }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  await updateTag({
    actorUserId: actor.dbUserId,
    tagId,
    name: getString(data, 'name'),
    slug: getString(data, 'slug'),
    description: getString(data, 'description') || null,
  });

  return NextResponse.json({ ok: true });
}
