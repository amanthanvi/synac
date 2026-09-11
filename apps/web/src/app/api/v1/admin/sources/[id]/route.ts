import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/admin';
import { updateSource } from '@/lib/adminSources';
import { withApiHandler } from '@/lib/apiErrors';
import { parseBody, patchSourceBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler<Context>(
  'api.admin.sources.patch',
  async (request, context) => {
    const actor = await requireRole(request, 'ADMIN');
    if (actor instanceof NextResponse) return actor;

    const { id: sourceId } = await context.params;

    const body = await parseBody(request, patchSourceBodySchema);
    if (!body.ok) return body.response;

    const data = body.data;

    await updateSource({
      actorUserId: actor.dbUserId,
      sourceId,
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
      notesInternal: data.notesInternal ?? null,
      licenseUrl: data.licenseUrl ?? null,
      licensePublicStatement: data.licensePublicStatement ?? null,
      attributionHtml: data.attributionHtml ?? null,
      tierRationale: data.tierRationale ?? null,
      snapshotAllowed: data.snapshotAllowed ?? false,
      defaultContentMode: data.defaultContentMode ?? null,
    });

    return NextResponse.json({ ok: true });
  },
);
