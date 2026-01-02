import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { approveIngestItem } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const { id: ingestItemId } = await context.params;

  const { entryId } = await approveIngestItem({
    actorUserId: actor.dbUserId,
    ingestItemId,
  });

  return NextResponse.json({ ok: true, entryId });
}
