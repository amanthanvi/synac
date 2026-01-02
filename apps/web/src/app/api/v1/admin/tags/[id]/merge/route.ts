import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { mergeTags } from '@/lib/adminTags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const { id: fromTagId } = await context.params;

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json', requestId }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const intoTagId = getString(data, 'intoTagId');

  await mergeTags({ actorUserId: actor.dbUserId, fromTagId, intoTagId });

  return NextResponse.json({ ok: true });
}
