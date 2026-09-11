import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { setSourceEnabled } from '@/lib/adminSources';
import { withApiHandler } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.sources.disable',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: sourceId } = await context.params;

    await setSourceEnabled({
      actorUserId: actor.dbUserId,
      sourceId,
      enabled: false,
    });

    return NextResponse.json({ ok: true });
  },
);
