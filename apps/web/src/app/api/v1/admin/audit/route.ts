import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeOptional(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export async function GET(request: Request) {
  await requireAdminActor();

  const url = new URL(request.url);
  const entity = normalizeOptional(url.searchParams.get('entity'));
  let entityType = normalizeOptional(url.searchParams.get('entityType'));
  let entityId = normalizeOptional(url.searchParams.get('entityId'));
  const action = normalizeOptional(url.searchParams.get('action'));
  const actorEmail = normalizeOptional(url.searchParams.get('actorEmail'))?.toLowerCase();

  if (entity) {
    const [tRaw, idRaw] = entity.split(':');
    const t = normalizeOptional(tRaw);
    const id = normalizeOptional(idRaw);
    entityType ??= t;
    entityId ??= id;
  }

  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? 200) || 200));

  const prisma = getPrismaClient();
  const events = await prisma.auditEvent.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(actorEmail
        ? {
            actorUser: {
              email: actorEmail,
            },
          }
        : {}),
    },
    include: {
      actorUser: { select: { email: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });

  return NextResponse.json({
    events: events.map((ev) => ({
      id: ev.id,
      createdAt: ev.createdAt,
      actorEmail: ev.actorUser.email,
      action: ev.action,
      entityType: ev.entityType,
      entityId: ev.entityId,
      hasBefore: Boolean(ev.before),
      hasAfter: Boolean(ev.after),
      requestId: ev.requestId,
    })),
    meta: {
      limit,
      filters: {
        entityType,
        entityId,
        action,
        actorEmail,
      },
    },
  });
}
