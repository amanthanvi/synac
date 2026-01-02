import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { rollbackEntryToAuditEvent } from '@/lib/adminEntryRollback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: entryId } = await context.params;

  const url = new URL(request.url);
  const revision = url.searchParams.get('revision') ?? url.searchParams.get('auditEventId');

  let bodyAuditEventId: string | undefined;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === 'object') {
      const v = (body as Record<string, unknown>).auditEventId;
      if (typeof v === 'string') bodyAuditEventId = v;
    }
  } catch {
    // ignore
  }

  const auditEventId = revision?.trim() || bodyAuditEventId?.trim();
  if (!auditEventId) {
    return NextResponse.json({ error: 'missing_revision' }, { status: 400 });
  }

  await rollbackEntryToAuditEvent({
    actorUserId: actor.dbUserId,
    entryId,
    auditEventId,
  });

  return NextResponse.json({ ok: true });
}
