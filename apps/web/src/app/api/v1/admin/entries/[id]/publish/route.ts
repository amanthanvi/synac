import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { publishEntry } from '@/lib/adminEntries';
import { withApiHandler } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Context>(
  'api.admin.entries.publish',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const { id: entryId } = await context.params;

    const result = await publishEntry({ actorUserId: actor.dbUserId, entryId });

    return NextResponse.json({ ok: true, ...result });
  },
);
