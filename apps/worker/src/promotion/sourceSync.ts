import type { PrismaClient } from '@synac/db';

export async function syncSourcesToStaging(
  prod: PrismaClient,
  staging: PrismaClient,
  input: { enabledAllowlistSlugs: Set<string> },
): Promise<{ upserted: number; disabledByAllowlist: number }> {
  const sources = await prod.source.findMany({
    select: {
      sourceSlug: true,
      name: true,
      baseUrl: true,
      cronSchedule: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      accessMethod: true,
      robotsPolicy: true,
      rateLimitPolicy: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      notesInternal: true,
    },
    orderBy: [{ sourceSlug: 'asc' }],
  });

  const hasAllowlist = input.enabledAllowlistSlugs.size > 0;

  let upserted = 0;
  let disabledByAllowlist = 0;

  for (const src of sources) {
    const allowlisted =
      !hasAllowlist ||
      input.enabledAllowlistSlugs.has(src.sourceSlug.toLowerCase());
    const enabled = Boolean(src.enabled && allowlisted);

    if (src.enabled && !allowlisted) disabledByAllowlist += 1;

    const fields = {
      name: src.name,
      baseUrl: src.baseUrl,
      // A source that staging must not run has no schedule to run on.
      cronSchedule: enabled ? src.cronSchedule : null,
      licenseType: src.licenseType,
      licenseNotes: src.licenseNotes,
      allowedUse: src.allowedUse,
      attributionRequirements: src.attributionRequirements,
      accessMethod: src.accessMethod,
      robotsPolicy: src.robotsPolicy,
      // `undefined` leaves the column untouched; a JSON `null` would have to go
      // through `Prisma.DbNull`, which `@synac/db` does not re-export as a value.
      rateLimitPolicy: src.rateLimitPolicy || undefined,
      contact: src.contact,
      lastVerifiedAt: src.lastVerifiedAt,
      trustTier: src.trustTier,
      enabled,
      notesInternal: src.notesInternal,
    };

    await staging.source.upsert({
      where: { sourceSlug: src.sourceSlug },
      update: fields,
      create: { ...fields, sourceSlug: src.sourceSlug },
      select: { id: true },
    });

    upserted += 1;
  }

  return { upserted, disabledByAllowlist };
}
