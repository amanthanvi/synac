import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { updateEntry } from '@/lib/adminEntries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: entryId } = await context.params;

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  await updateEntry({
    actorUserId: actor.dbUserId,
    entryId,
    displayTitle: getString(data, 'displayTitle'),
    primarySlug: getString(data, 'primarySlug'),
    summaryMd: getString(data, 'summaryMd'),
    editorialNotes: getString(data, 'editorialNotes'),
  });

  return NextResponse.json({ ok: true });
}
