import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
  }

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

  if (!run) {
    return NextResponse.json({ error: 'not_found', requestId }, { status: 404 });
  }

  return NextResponse.json({ run });
}
