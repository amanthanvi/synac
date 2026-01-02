import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { rejectIngestItem } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const reason = (body as Record<string, unknown>).reason;
  await rejectIngestItem({
    actorUserId: actor.dbUserId,
    ingestItemId: context.params.id,
    reason: typeof reason === 'string' ? reason : '',
  });

  return NextResponse.json({ ok: true });
}

