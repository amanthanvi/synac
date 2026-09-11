import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { updateTag } from '@/lib/adminTags';
import { withApiHandler } from '@/lib/apiErrors';
import { parseBody, patchTagBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler<Context>(
  'api.admin.tags.patch',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: tagId } = await context.params;

    const body = await parseBody(request, patchTagBodySchema);
    if (!body.ok) return body.response;

    const input: Parameters<typeof updateTag>[0] = {
      actorUserId: actor.dbUserId,
      tagId,
      name: body.data.name,
      slug: body.data.slug,
      description: body.data.description ?? null,
      parentId: body.data.parentId ?? null,
    };
    if (body.data.kind) input.kind = body.data.kind;

    await updateTag(input);

    return NextResponse.json({ ok: true });
  },
);
