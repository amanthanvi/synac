import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { setSourceEnabled } from '@/lib/adminSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const { id: sourceId } = await context.params;

  await setSourceEnabled({
    actorUserId: actor.dbUserId,
    sourceId,
    enabled: false,
  });

  return NextResponse.json({ ok: true });
}
