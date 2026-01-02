import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';
import { createIngestRun } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function getNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  return typeof value === 'number' ? value : Number(value);
}

export async function GET() {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prisma = getPrismaClient();
  const runs = await prisma.ingestRun.findMany({
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      source: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ startedAt: 'desc' }],
    take: 100,
  });

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      source: r.source,
      itemCount: r._count.items,
    })),
  });
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
  const sourceId = getString(data, 'sourceId');
  const maxItems = getNumber(data, 'maxItems') || 100;

  const { ingestRunId } = await createIngestRun({
    actorUserId: actor.dbUserId,
    sourceId,
    maxItems,
  });

  return NextResponse.json({ ingestRunId });
}

