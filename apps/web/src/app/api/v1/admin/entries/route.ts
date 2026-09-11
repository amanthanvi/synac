import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { createDraftEntry } from '@/lib/adminEntries';
import { withApiHandler } from '@/lib/apiErrors';
import { createEntryBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(
  'api.admin.entries.create',
  async (request) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const body = await parseBody(request, createEntryBodySchema);
    if (!body.ok) return body.response;

    const input: Parameters<typeof createDraftEntry>[0] = {
      actorUserId: actor.dbUserId,
      entryType: body.data.entryType,
      displayTitle: body.data.displayTitle,
    };
    if (body.data.primarySlug) input.primarySlug = body.data.primarySlug;

    const { entryId } = await createDraftEntry(input);

    return NextResponse.json({ entryId }, { status: 201 });
  },
);
