import { NextResponse } from 'next/server';

import { getString, normalizeOptional } from '@synac/shared';

import { requireAdminActor } from '@/lib/admin';
import { rejectIngestItem } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = normalizeOptional(request.headers.get('x-request-id')) ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const { id: ingestItemId } = await context.params;

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json', requestId }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  await rejectIngestItem({
    actorUserId: actor.dbUserId,
    ingestItemId,
    reason: getString(data, 'reason'),
  });

  return NextResponse.json({ ok: true });
}
