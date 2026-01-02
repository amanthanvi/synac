import type { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';

export type PublicSource = Prisma.SourceGetPayload<{
  select: {
    id: true;
    name: true;
    sourceSlug: true;
    baseUrl: true;
    licenseType: true;
    licenseNotes: true;
    allowedUse: true;
    attributionRequirements: true;
    contact: true;
    lastVerifiedAt: true;
    trustTier: true;
    enabled: true;
    updatedAt: true;
  };
}>;

export async function listPublicSources(db: DbClientLike): Promise<PublicSource[]> {
  return db.source.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      updatedAt: true,
    },
    orderBy: [{ name: 'asc' }],
  });
}

export async function resolvePublicSourceBySlug(
  db: DbClientLike,
  input: { slug: string },
): Promise<PublicSource | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) return null;

  return db.source.findFirst({
    where: { sourceSlug: slug, enabled: true },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      updatedAt: true,
    },
  });
}

