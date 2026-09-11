import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { rollbackEntryToAuditEvent } from '@/lib/adminEntryRollback';
import { getRequestId, withApiHandler } from '@/lib/apiErrors';
import { parseBody, rollbackEntryBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.entries.rollback',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: entryId } = await context.params;

    // The revision may arrive as `?revision=`, `?auditEventId=`, or in the body.
    const url = new URL(request.url);
    const fromQuery =
      url.searchParams.get('revision')?.trim() ||
      url.searchParams.get('auditEventId')?.trim();

    const body = await parseBody(request, rollbackEntryBodySchema);
    if (!body.ok) return body.response;

    const auditEventId = fromQuery || body.data.auditEventId;
    if (!auditEventId) {
      return NextResponse.json(
        { error: 'missing_revision', requestId: getRequestId(request) },
        { status: 400 },
      );
    }

    await rollbackEntryToAuditEvent({
      actorUserId: actor.dbUserId,
      entryId,
      auditEventId,
    });

    return NextResponse.json({ ok: true });
  },
);
