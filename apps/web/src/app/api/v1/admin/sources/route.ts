import { NextResponse } from 'next/server';

import { getString, normalizeOptional } from '@synac/shared';

import { requireAdminActor } from '@/lib/admin';
import { createSource } from '@/lib/adminSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function strictBooleanTrue(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true;
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

  const { sourceId } = await createSource({
    actorUserId: actor.dbUserId,
    name: getString(data, 'name'),
    sourceSlug: getString(data, 'sourceSlug'),
    baseUrl: getString(data, 'baseUrl'),
    licenseType: getString(data, 'licenseType'),
    licenseNotes: getString(data, 'licenseNotes'),
    allowedUse: getString(data, 'allowedUse'),
    attributionRequirements: getString(data, 'attributionRequirements'),
    accessMethod: getString(data, 'accessMethod'),
    robotsPolicy: getString(data, 'robotsPolicy'),
    rateLimitPolicy: getString(data, 'rateLimitPolicy'),
    contact: getString(data, 'contact'),
    lastVerifiedAt: getString(data, 'lastVerifiedAt'),
    trustTier: getString(data, 'trustTier'),
    enabled: strictBooleanTrue(data, 'enabled'),
    notesInternal: getString(data, 'notesInternal'),
  });

  return NextResponse.json({ sourceId });
}
