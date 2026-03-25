import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIntegrationTestClient, resetIntegrationDatabase } from '@synac/db';

import { publishEntry } from './adminEntries';

const prisma = createIntegrationTestClient();

async function createActor(userId: string) {
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.com`,
      authProvider: 'LOCAL',
      status: 'ACTIVE',
    },
  });
}

async function createCitationBundle() {
  const source = await prisma.source.create({
    data: {
      name: 'Test Source',
      sourceSlug: 'test-source',
      baseUrl: 'https://example.com',
      licenseType: 'CC_BY_4_0',
      allowedUse: 'Allowed',
      attributionRequirements: 'Attribution required',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });

  const sourceDocument = await prisma.sourceDocument.create({
    data: {
      sourceId: source.id,
      url: 'https://example.com/doc',
      canonicalUrl: 'https://example.com/doc',
      title: 'Source document',
      contentType: 'text/html',
      fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
      contentSha256: 'sha256-test',
      snapshotAllowed: false,
    },
    select: { id: true },
  });

  return prisma.citation.create({
    data: {
      sourceId: source.id,
      sourceDocumentId: sourceDocument.id,
      url: 'https://example.com/doc',
      citationText: 'Source document',
      accessedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });
}

async function createDraftEntry(input: {
  slug: string;
  title: string;
  summaryMd: string | null;
  definitionMd?: string;
}) {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'DRAFT',
      ...(input.summaryMd
        ? {
            summaryMd: input.summaryMd,
            summaryText: input.summaryMd,
          }
        : {}),
    },
    select: { id: true },
  });

  if (input.definitionMd) {
    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        definitionMd: input.definitionMd,
        definitionText: input.definitionMd,
        status: 'DRAFT',
      },
    });
  }

  return entry;
}

describe('publish entry workflow integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects publishing when the entry summary is missing', async () => {
    const actorUserId = '11111111-1111-1111-1111-111111111111';
    await createActor(actorUserId);

    const entry = await createDraftEntry({
      slug: 'missing-summary',
      title: 'Missing Summary',
      summaryMd: null,
      definitionMd: 'Definition',
    });

    await expect(
      publishEntry({ actorUserId, entryId: entry.id }),
    ).rejects.toThrow('Publishing requires a summary');
  });

  it('rejects publishing when publishable senses have no citations or editorial rationale', async () => {
    const actorUserId = '11111111-1111-1111-1111-111111111111';
    await createActor(actorUserId);

    const entry = await createDraftEntry({
      slug: 'missing-citations',
      title: 'Missing Citations',
      summaryMd: 'Summary',
      definitionMd: 'Definition',
    });

    await expect(
      publishEntry({ actorUserId, entryId: entry.id }),
    ).rejects.toThrow('Publishing requires citations per sense (or Editorial rationale)');
  });

  it('publishes a real entry and keeps auto-tagging non-destructive', async () => {
    const actorUserId = '11111111-1111-1111-1111-111111111111';
    await createActor(actorUserId);
    const citation = await createCitationBundle();

    const activeIdentityTag = await prisma.tag.create({
      data: {
        name: 'Curated Identity',
        slug: 'identity',
        description: 'Keep me intact',
      },
      select: { id: true },
    });

    await prisma.tag.create({
      data: {
        name: 'Deleted AppSec',
        slug: 'application-security',
        description: 'Deleted tag should stay deleted',
        deletedAt: new Date('2026-03-24T00:00:00.000Z'),
      },
    });

    const entry = await createDraftEntry({
      slug: 'authentication-test',
      title: 'Authentication Test',
      summaryMd: 'Authentication and token handling.',
      definitionMd: 'A vulnerability can expose authentication tokens.',
    });

    const sense = await prisma.sense.findFirstOrThrow({
      where: { entryId: entry.id },
      select: { id: true },
    });

    await prisma.fieldProvenance.create({
      data: {
        entityType: 'SENSE',
        entityId: sense.id,
        fieldName: 'definitionMd',
        citationId: citation.id,
        contentMode: 'SUMMARIZED',
        extractionMethod: 'MANUAL',
        extractorVersion: 'integration-test',
        extractedAt: new Date('2026-03-24T00:00:00.000Z'),
      },
    });

    const result = await publishEntry({
      actorUserId,
      entryId: entry.id,
    });

    const publishedEntry = await prisma.entry.findUniqueOrThrow({
      where: { id: entry.id },
      select: { status: true },
    });
    const publishedSense = await prisma.sense.findUniqueOrThrow({
      where: { id: sense.id },
      select: { status: true },
    });
    const identityTag = await prisma.tag.findUniqueOrThrow({
      where: { id: activeIdentityTag.id },
      select: { name: true, description: true },
    });
    const appSecActive = await prisma.tag.findMany({
      where: { slug: 'application-security', deletedAt: null },
      select: { id: true },
    });
    const entryTagLinks = await prisma.entryTag.findMany({
      where: { entryId: entry.id },
      select: { tagId: true },
    });

    expect(result).toEqual({ publishedSenseCount: 1 });
    expect(publishedEntry.status).toBe('PUBLISHED');
    expect(publishedSense.status).toBe('PUBLISHED');
    expect(identityTag).toEqual({
      name: 'Curated Identity',
      description: 'Keep me intact',
    });
    expect(appSecActive).toHaveLength(0);
    expect(entryTagLinks.map((row) => row.tagId)).toContain(activeIdentityTag.id);
  });
});
