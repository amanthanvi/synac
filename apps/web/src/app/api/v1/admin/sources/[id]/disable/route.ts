import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { setSourceEnabled } from '@/lib/adminSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: { id: string } }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await setSourceEnabled({
    actorUserId: actor.dbUserId,
    sourceId: context.params.id,
    enabled: false,
  });

  return NextResponse.json({ ok: true });
}

