/**
 * Fixture builders for the public API route tests. Kept beside the routes (in
 * the private `_shared` folder) so every route test seeds the same shape of
 * corpus: an entry, a published sense, a citation, and the source licence
 * metadata the API is obliged to echo.
 */
import type { PrismaClient } from '@synac/db';

export async function createSourceBundle(
  prisma: PrismaClient,
  overrides?: { slug?: string; name?: string },
): Promise<{ sourceId: string; sourceDocumentId: string; citationId: string }> {
  const source = await prisma.source.create({
    data: {
      name: overrides?.name ?? 'NIST CSRC',
      sourceSlug: overrides?.slug ?? 'nist-csrc',
      baseUrl: 'https://csrc.nist.gov',
      licenseType: 'PUBLIC_DOMAIN',
      licenseUrl: 'https://www.nist.gov/open/license',
      licensePublicStatement: 'US Government work, public domain.',
      attributionHtml: '<a href="https://csrc.nist.gov">NIST CSRC</a>',
      tierRationale: 'Primary standards body.',
      snapshotAllowed: true,
      defaultContentMode: 'QUOTED',
      allowedUse: 'Unrestricted reuse with attribution.',
      attributionRequirements: 'Cite NIST CSRC.',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });

  const document = await prisma.sourceDocument.create({
    data: {
      sourceId: source.id,
      url: `https://csrc.nist.gov/glossary/${overrides?.slug ?? 'nist-csrc'}`,
      title: 'NIST Glossary',
      contentType: 'text/html',
      fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
      contentSha256: 'a'.repeat(64),
      snapshotAllowed: true,
    },
    select: { id: true, url: true },
  });

  const citation = await prisma.citation.create({
    data: {
      sourceId: source.id,
      sourceDocumentId: document.id,
      url: document.url,
      citationText: 'NIST CSRC Glossary',
      licenseNote: 'Public domain',
      attributionText: 'Cite NIST CSRC.',
      accessedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });

  return {
    sourceId: source.id,
    sourceDocumentId: document.id,
    citationId: citation.id,
  };
}

export async function createPublishedEntryWithCitation(
  prisma: PrismaClient,
  input: {
    entryType?: 'TERM' | 'ACRONYM';
    slug: string;
    title: string;
    summary?: string;
    definition?: string;
    senseLabel?: string;
    senseSlug?: string;
    citationId: string;
    tagSlug?: string;
  },
): Promise<{ entryId: string; senseId: string }> {
  const entry = await prisma.entry.create({
    data: {
      entryType: input.entryType ?? 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.summary ?? `${input.title} summary.`,
      summaryText: input.summary ?? `${input.title} summary.`,
      publishedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });

  const definition = input.definition ?? `${input.title} is defined here.`;

  const sense = await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      senseLabel: input.senseLabel ?? null,
      slug: input.senseSlug ?? null,
      definitionMd: definition,
      definitionText: definition,
      status: 'PUBLISHED',
      isPreferred: true,
      publishedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });

  await prisma.senseDefinition.create({
    data: {
      senseId: sense.id,
      citationId: input.citationId,
      definitionMd: definition,
      definitionText: definition,
      contentMode: 'QUOTED',
      isPrimary: true,
      extractorVersion: 'test-1',
      extractedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
  });

  await prisma.fieldProvenance.create({
    data: {
      entityType: 'SENSE',
      entityId: sense.id,
      fieldName: 'definitionMd',
      citationId: input.citationId,
      contentMode: 'QUOTED',
      extractionMethod: 'HTML',
      extractorVersion: 'test-1',
      extractedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
  });

  if (input.tagSlug) {
    const existing = await prisma.tag.findFirst({
      where: { slug: input.tagSlug, deletedAt: null },
      select: { id: true },
    });
    const tag =
      existing ??
      (await prisma.tag.create({
        data: { name: input.tagSlug, slug: input.tagSlug },
        select: { id: true },
      }));

    await prisma.entryTag.create({
      data: { entryId: entry.id, tagId: tag.id, assignedBy: 'EDITORIAL' },
    });
  }

  return { entryId: entry.id, senseId: sense.id };
}
