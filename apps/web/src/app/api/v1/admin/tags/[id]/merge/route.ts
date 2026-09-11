import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { mergeTags } from '@/lib/adminTags';
import { withApiHandler } from '@/lib/apiErrors';
import { mergeTagBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.tags.merge',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: fromTagId } = await context.params;

    const body = await parseBody(request, mergeTagBodySchema);
    if (!body.ok) return body.response;

    await mergeTags({
      actorUserId: actor.dbUserId,
      fromTagId,
      intoTagId: body.data.intoTagId,
    });

    return NextResponse.json({ ok: true });
  },
);
