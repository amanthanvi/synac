import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireRole } from '@/lib/admin';
import { notFoundError, withApiHandler } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Context>(
  'api.admin.ingest.runs.get',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN', 'EDITOR');
    if (actor instanceof NextResponse) return actor;

    const { id } = await context.params;

    const prisma = getPrismaClient();
    const run = await prisma.ingestRun.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        configSnapshot: true,
        stats: true,
        source: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            stage: true,
            licenseGate: true,
            confidenceScore: true,
            error: true,
            proposedChange: true,
            diff: true,
            sourceDocument: { select: { url: true, canonicalUrl: true } },
          },
          orderBy: [{ id: 'asc' }],
          take: 500,
        },
      },
    });

    if (!run) throw notFoundError('Ingest run not found');

    return NextResponse.json({ run });
  },
);
