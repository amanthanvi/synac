import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { approveIngestItem } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: { id: string } }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { entryId } = await approveIngestItem({
    actorUserId: actor.dbUserId,
    ingestItemId: context.params.id,
  });

  return NextResponse.json({ ok: true, entryId });
}

