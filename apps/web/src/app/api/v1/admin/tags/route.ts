import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';
import { createTag } from '@/lib/adminTags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export async function GET() {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prisma = getPrismaClient();
  const tags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
    orderBy: [{ name: 'asc' }],
    take: 1000,
  });

  return NextResponse.json({ tags });
}

export async function POST(request: Request) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const result = await createTag({
    actorUserId: actor.dbUserId,
    name: getString(data, 'name'),
    slug: getString(data, 'slug') || null,
    description: getString(data, 'description') || null,
  });

  return NextResponse.json(result);
}

