import { NextResponse } from 'next/server';

import { getBoolean, getNumber, getString, normalizeOptional } from '@synac/shared';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';
import { createIngestRun, createIngestRunsForAllSources } from '@/lib/adminIngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = normalizeOptional(request.headers.get('x-request-id')) ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
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
  const requestId = normalizeOptional(request.headers.get('x-request-id')) ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json', requestId }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const sourceId = getString(data, 'sourceId');
  const maxItems = getNumber(data, 'maxItems') || 100;
  const forceReprocess = getBoolean(data, 'forceReprocess');

  if (!sourceId || sourceId.toUpperCase() === 'ALL') {
    const prisma = getPrismaClient();
    const enabledSources = await prisma.source.count({ where: { enabled: true } });
    if (enabledSources === 0) {
      return NextResponse.json({ error: 'no_enabled_sources', requestId }, { status: 400 });
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
