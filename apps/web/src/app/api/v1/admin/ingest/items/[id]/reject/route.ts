import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { rejectIngestItem } from '@/lib/adminIngest';
import { withApiHandler } from '@/lib/apiErrors';
import { parseBody, rejectIngestItemBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.ingest.items.reject',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const { id: ingestItemId } = await context.params;

    const body = await parseBody(request, rejectIngestItemBodySchema);
    if (!body.ok) return body.response;

    await rejectIngestItem({
      actorUserId: actor.dbUserId,
      ingestItemId,
      reason: body.data.reason,
    });

    return NextResponse.json({ ok: true });
  },
);
