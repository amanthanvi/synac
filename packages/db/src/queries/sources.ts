import type { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';

const publicSourceSelect = {
  id: true,
  name: true,
  sourceSlug: true,
  baseUrl: true,
  licenseType: true,
  licenseNotes: true,
  licenseUrl: true,
  licensePublicStatement: true,
  attributionHtml: true,
  tierRationale: true,
  snapshotAllowed: true,
  defaultContentMode: true,
  allowedUse: true,
  attributionRequirements: true,
  contact: true,
  lastVerifiedAt: true,
  trustTier: true,
  enabled: true,
  updatedAt: true,
} satisfies Prisma.SourceSelect;

export type PublicSource = Prisma.SourceGetPayload<{
  select: typeof publicSourceSelect;
}>;

export async function listPublicSources(
  db: DbClientLike,
): Promise<PublicSource[]> {
  return db.source.findMany({
    where: { enabled: true },
    select: publicSourceSelect,
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
    select: publicSourceSelect,
  });
}
