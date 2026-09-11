import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { createSource } from '@/lib/adminSources';
import { withApiHandler } from '@/lib/apiErrors';
import { createSourceBodySchema, parseBody } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(
  'api.admin.sources.create',
  async (request) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const body = await parseBody(request, createSourceBodySchema);
    if (!body.ok) return body.response;

    const data = body.data;

    const { sourceId } = await createSource({
      actorUserId: actor.dbUserId,
      name: data.name,
      sourceSlug: data.sourceSlug,
      baseUrl: data.baseUrl,
      cronSchedule: data.cronSchedule ?? null,
      licenseType: data.licenseType,
      licenseNotes: data.licenseNotes ?? null,
      allowedUse: data.allowedUse,
      attributionRequirements: data.attributionRequirements,
      accessMethod: data.accessMethod,
      robotsPolicy: data.robotsPolicy,
      rateLimitPolicy: data.rateLimitPolicy ?? null,
      contact: data.contact ?? null,
      lastVerifiedAt: data.lastVerifiedAt ?? null,
      trustTier: data.trustTier,
      enabled: data.enabled,
      notesInternal: data.notesInternal ?? null,
      licenseUrl: data.licenseUrl ?? null,
      licensePublicStatement: data.licensePublicStatement ?? null,
      attributionHtml: data.attributionHtml ?? null,
      tierRationale: data.tierRationale ?? null,
      snapshotAllowed: data.snapshotAllowed ?? false,
      defaultContentMode: data.defaultContentMode ?? null,
    });

    return NextResponse.json({ sourceId }, { status: 201 });
  },
);
