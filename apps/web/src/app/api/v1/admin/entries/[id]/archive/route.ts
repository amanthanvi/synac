import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { archiveEntry } from '@/lib/adminEntries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: { id: string } }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await archiveEntry({
    actorUserId: actor.dbUserId,
    entryId: context.params.id,
  });

  return NextResponse.json({ ok: true });
}

