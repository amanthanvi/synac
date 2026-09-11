import { NextResponse } from 'next/server';

import { getPrismaClient, type Prisma } from '@synac/db';
import { normalizeOptional } from '@synac/shared';

import { requireRole } from '@/lib/admin';
import { withApiHandler } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The audit log names who did what, including the actor's email address. Only
 * ADMINs may read it: an EDITOR needs to see the entries, not the roster.
 */
export const GET = withApiHandler('api.admin.audit', async (request) => {
  const actor = await requireRole(request, 'ADMIN');
  if (actor instanceof NextResponse) return actor;

  const url = new URL(request.url);
  const entity = normalizeOptional(url.searchParams.get('entity'));
  let entityType = normalizeOptional(url.searchParams.get('entityType'));
  let entityId = normalizeOptional(url.searchParams.get('entityId'));
  const action = normalizeOptional(url.searchParams.get('action'));
  const actorEmail = normalizeOptional(
    url.searchParams.get('actorEmail'),
  )?.toLowerCase();

  if (entity) {
    const [tRaw, idRaw] = entity.split(':');
    const t = normalizeOptional(tRaw);
    const id = normalizeOptional(idRaw);
    entityType ??= t;
    entityId ??= id;
  }

  const limit = Math.max(
    1,
    Math.min(500, Number(url.searchParams.get('limit') ?? 200) || 200),
  );

  const where: Prisma.AuditEventWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (actorEmail) where.actorUser = { email: actorEmail };

  const prisma = getPrismaClient();
  const events = await prisma.auditEvent.findMany({
    where,
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
      filters: { entityType, entityId, action, actorEmail },
    },
  });
});
