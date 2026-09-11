import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireRole } from '@/lib/admin';
import {
  createIngestRun,
  createIngestRunsForAllSources,
} from '@/lib/adminIngest';
import { getRequestId, withApiHandler } from '@/lib/apiErrors';
import { createIngestRunBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(
  'api.admin.ingest.runs.list',
  async (request) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

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
  },
);

export const POST = withApiHandler(
  'api.admin.ingest.runs.create',
  async (request) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const body = await parseBody(request, createIngestRunBodySchema);
    if (!body.ok) return body.response;

    const { sourceId, maxItems, forceReprocess } = body.data;

    if (!sourceId || sourceId.toUpperCase() === 'ALL') {
      const prisma = getPrismaClient();
      const enabledSources = await prisma.source.count({
        where: { enabled: true },
      });
      if (enabledSources === 0) {
        return NextResponse.json(
          { error: 'no_enabled_sources', requestId: getRequestId(request) },
          { status: 400 },
        );
      }

      const { ingestRunIds } = await createIngestRunsForAllSources({
        actorUserId: actor.dbUserId,
        maxItems,
        forceReprocess,
      });

      return NextResponse.json({ ingestRunIds }, { status: 202 });
    }

    const { ingestRunId } = await createIngestRun({
      actorUserId: actor.dbUserId,
      sourceId,
      maxItems,
      forceReprocess,
    });

    return NextResponse.json({ ingestRunId }, { status: 202 });
  },
);
