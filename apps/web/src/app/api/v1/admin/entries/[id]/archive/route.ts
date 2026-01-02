import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { archiveEntry } from '@/lib/adminEntries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: entryId } = await context.params;

  await archiveEntry({
    actorUserId: actor.dbUserId,
    entryId,
  });

  return NextResponse.json({ ok: true });
}
