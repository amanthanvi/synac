import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { setSourceEnabled } from '@/lib/adminSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: sourceId } = await context.params;

  await setSourceEnabled({
    actorUserId: actor.dbUserId,
    sourceId,
    enabled: false,
  });

  return NextResponse.json({ ok: true });
}
