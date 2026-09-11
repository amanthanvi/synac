import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { approveIngestItem } from '@/lib/adminIngest';
import { withApiHandler } from '@/lib/apiErrors';
import { approveIngestItemBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.ingest.items.approve',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const { id: ingestItemId } = await context.params;

    const body = await parseBody(request, approveIngestItemBodySchema);
    if (!body.ok) return body.response;

    const input: Parameters<typeof approveIngestItem>[0] = {
      actorUserId: actor.dbUserId,
      ingestItemId,
    };
    if (body.data.attachThreshold !== undefined) {
      input.attachThreshold = body.data.attachThreshold;
    }

    const result = await approveIngestItem(input);

    return NextResponse.json({ ok: true, ...result });
  },
);
