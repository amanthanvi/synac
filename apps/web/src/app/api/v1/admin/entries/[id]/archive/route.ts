import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { archiveEntry } from '@/lib/adminEntries';
import { withApiHandler } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.entries.archive',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: entryId } = await context.params;

    await archiveEntry({ actorUserId: actor.dbUserId, entryId });

    return NextResponse.json({ ok: true });
  },
);
