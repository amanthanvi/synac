import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { updateEntry } from '@/lib/adminEntries';
import { withApiHandler } from '@/lib/apiErrors';
import { parseBody, patchEntryBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler<Context>(
  'api.admin.entries.patch',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const { id: entryId } = await context.params;

    const body = await parseBody(request, patchEntryBodySchema);
    if (!body.ok) return body.response;

    await updateEntry({
      actorUserId: actor.dbUserId,
      entryId,
      displayTitle: body.data.displayTitle,
      primarySlug: body.data.primarySlug,
      summaryMd: body.data.summaryMd,
      editorialNotes: body.data.editorialNotes,
    });

    return NextResponse.json({ ok: true });
  },
);
