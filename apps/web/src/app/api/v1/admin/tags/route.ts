import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireRole } from '@/lib/admin';
import { createTag } from '@/lib/adminTags';
import { withApiHandler } from '@/lib/apiErrors';
import { createTagBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler('api.admin.tags.list', async (request) => {
  const actor = await requireRole(request, 'ADMIN', 'EDITOR');
  if (actor instanceof NextResponse) return actor;

  const prisma = getPrismaClient();
  const tags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      kind: true,
      parentId: true,
      updatedAt: true,
    },
    orderBy: [{ name: 'asc' }],
    take: 1000,
  });

  return NextResponse.json({ tags });
});

export const POST = withApiHandler('api.admin.tags.create', async (request) => {
  const actor = await requireRole(request, 'ADMIN');
  if (actor instanceof NextResponse) return actor;

  const body = await parseBody(request, createTagBodySchema);
  if (!body.ok) return body.response;

  const input: Parameters<typeof createTag>[0] = {
    actorUserId: actor.dbUserId,
    name: body.data.name,
    slug: body.data.slug ?? null,
    description: body.data.description ?? null,
    parentId: body.data.parentId ?? null,
  };
  if (body.data.kind) input.kind = body.data.kind;

  const result = await createTag(input);

  return NextResponse.json(result, { status: 201 });
});
