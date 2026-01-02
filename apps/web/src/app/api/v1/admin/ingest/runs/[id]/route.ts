import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: { id: string } }) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prisma = getPrismaClient();
  const run = await prisma.ingestRun.findFirst({
    where: { id: context.params.id },
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
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ run });
}

