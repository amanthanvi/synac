import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';
import { createIngestRun, createIngestRunsForAllSources } from '@/lib/adminIngest';

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

function getBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value === 'boolean') return value;
  const v = typeof value === 'string' ? value : String(value ?? '');
  return v.trim().toLowerCase() === 'true' || v.trim() === '1';
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
  const forceReprocess = getBoolean(data, 'forceReprocess');

  if (!sourceId || sourceId.toUpperCase() === 'ALL') {
    const prisma = getPrismaClient();
    const enabledSources = await prisma.source.count({ where: { enabled: true } });
    if (enabledSources === 0) {
      return NextResponse.json({ error: 'no_enabled_sources' }, { status: 400 });
    }

    const { ingestRunIds } = await createIngestRunsForAllSources({
      actorUserId: actor.dbUserId,
      maxItems,
      forceReprocess,
    });

    return NextResponse.json({ ingestRunIds });
  }

  const { ingestRunId } = await createIngestRun({ actorUserId: actor.dbUserId, sourceId, maxItems, forceReprocess });

  return NextResponse.json({ ingestRunId });
}
