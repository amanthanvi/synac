import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  SENSE_SEARCH_BUCKET,
  getSenseSearchCoverage,
  rebuildSenseSearchIndex,
  searchPublishedSenses,
} from './senseSearch.js';

const prisma = createIntegrationTestClient();

async function seedSoc(): Promise<{
  entryId: string;
  socCenterId: string;
  socChipId: string;
}> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'ACRONYM',
      displayTitle: 'SOC',
      normalizedTitle: 'soc',
      primarySlug: 'soc',
      status: 'PUBLISHED',
      summaryMd: 'SOC has two unrelated established meanings.',
      summaryText: 'SOC has two unrelated established meanings.',
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  const socCenter = await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      senseLabel: 'Security Operations Center',
      expandedForm: 'Security Operations Center',
      slug: 'security-operations-center',
      definitionMd:
        'A facility where analysts detect and respond to intrusions.',
      definitionText:
        'A facility where analysts detect and respond to intrusions.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  const socChip = await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 1,
      senseLabel: 'System on Chip',
      expandedForm: 'System on Chip',
      slug: 'system-on-chip',
      definitionMd:
        'An integrated circuit combining processor, memory, and peripherals.',
      definitionText:
        'An integrated circuit combining processor, memory, and peripherals.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  return {
    entryId: entry.id,
    socCenterId: socCenter.id,
    socChipId: socChip.id,
  };
}

const PAGE = { page: 1, pageSize: 20 };

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('searchPublishedSenses', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('returns each meaning of an acronym as its own hit with a fragment URL', async () => {
    const { socCenterId, socChipId } = await seedSoc();

    const page = await searchPublishedSenses(prisma, { query: 'SOC', ...PAGE });

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);

    const byId = new Map(page.items.map((item) => [item.senseId, item]));
    expect(byId.get(socCenterId)?.url).toBe(
      '/acronym/soc#s-security-operations-center',
    );
    expect(byId.get(socChipId)?.url).toBe('/acronym/soc#s-system-on-chip');
    expect(byId.get(socCenterId)?.senseLabel).toBe(
      'Security Operations Center',
    );
    expect(byId.get(socChipId)?.senseLabel).toBe('System on Chip');
    expect(
      page.items.every((item) => item.bucket === SENSE_SEARCH_BUCKET.EXACT),
    ).toBe(true);
  });

  it('resolves one meaning when the query names the expansion', async () => {
    const { socCenterId } = await seedSoc();

    const page = await searchPublishedSenses(prisma, {
      query: 'security operations center',
      ...PAGE,
    });

    expect(page.items[0]?.senseId).toBe(socCenterId);
    expect(page.items[0]?.bucket).toBe(SENSE_SEARCH_BUCKET.EXACT);
  });

  it('builds term URLs for non-acronym entries', async () => {
    const entry = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Zero Trust',
        normalizedTitle: 'zero trust',
        primarySlug: 'zero-trust',
        status: 'PUBLISHED',
        summaryMd:
          'Zero trust removes implicit confidence in network location.',
        summaryText:
          'Zero trust removes implicit confidence in network location.',
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        senseLabel: 'Architectural model',
        slug: 'architectural-model',
        definitionMd: 'Each request is evaluated on its own merits.',
        definitionText: 'Each request is evaluated on its own merits.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    const page = await searchPublishedSenses(prisma, {
      query: 'zero trust',
      ...PAGE,
    });

    expect(page.items[0]?.url).toBe('/term/zero-trust#s-architectural-model');
  });

  it('filters by entry type and ignores stopword queries', async () => {
    await seedSoc();

    const terms = await searchPublishedSenses(prisma, {
      query: 'SOC',
      entryType: 'TERM',
      ...PAGE,
    });
    expect(terms).toEqual({ items: [], total: 0 });

    expect(
      await searchPublishedSenses(prisma, { query: 'the', ...PAGE }),
    ).toEqual({
      items: [],
      total: 0,
    });
  });

  it('surfaces attesting source names alongside the meaning', async () => {
    const { socCenterId } = await seedSoc();

    const source = await prisma.source.create({
      data: {
        name: 'NIST CSRC Glossary',
        sourceSlug: 'nist-csrc-glossary',
        baseUrl: 'https://csrc.nist.gov/glossary',
        licenseType: 'PUBLIC_DOMAIN',
        allowedUse: 'Public information.',
        attributionRequirements: 'Source: NIST CSRC Glossary.',
        accessMethod: 'HTML',
        robotsPolicy: 'RESPECT',
        trustTier: 'TIER_1',
        enabled: true,
      },
      select: { id: true },
    });
    const document = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: 'https://csrc.nist.gov/glossary/term/soc',
        contentType: 'text/html',
        fetchedAt: new Date(),
        contentSha256: 'b'.repeat(64),
        snapshotAllowed: false,
      },
      select: { id: true },
    });
    const citation = await prisma.citation.create({
      data: {
        sourceId: source.id,
        sourceDocumentId: document.id,
        url: 'https://csrc.nist.gov/glossary/term/soc',
        citationText: 'NIST CSRC Glossary',
        attributionText: 'Source: NIST CSRC Glossary.',
        accessedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.senseDefinition.create({
      data: {
        senseId: socCenterId,
        citationId: citation.id,
        definitionMd: 'A centralized unit that deals with security issues.',
        definitionText: 'A centralized unit that deals with security issues.',
        isPrimary: true,
      },
    });

    const page = await searchPublishedSenses(prisma, { query: 'SOC', ...PAGE });
    const center = page.items.find((item) => item.senseId === socCenterId);

    expect(center?.sourceNames).toBe('NIST CSRC Glossary');
  });
});

describe('sense_search maintenance', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('creates and removes rows as senses are published and archived', async () => {
    const { entryId, socCenterId, socChipId } = await seedSoc();

    expect(await prisma.senseSearch.count({ where: { entryId } })).toBe(2);

    await prisma.sense.update({
      where: { id: socChipId },
      data: { status: 'ARCHIVED' },
    });

    expect(
      await prisma.senseSearch.findUnique({ where: { senseId: socChipId } }),
    ).toBeNull();
    expect(
      await prisma.senseSearch.findUnique({ where: { senseId: socCenterId } }),
    ).not.toBeNull();

    await prisma.sense.update({
      where: { id: socChipId },
      data: { status: 'PUBLISHED' },
    });
    expect(await prisma.senseSearch.count({ where: { entryId } })).toBe(2);

    await prisma.entry.update({
      where: { id: entryId },
      data: { status: 'ARCHIVED' },
    });
    expect(await prisma.senseSearch.count({ where: { entryId } })).toBe(0);
  });

  it('rebuilds the index and reports coverage', async () => {
    const { entryId, socCenterId } = await seedSoc();

    await prisma.$executeRawUnsafe('DELETE FROM sense_search');

    const missing = await getSenseSearchCoverage(prisma, { limit: 10 });
    expect(missing.publishedSenses).toBe(2);
    expect(missing.indexedSenses).toBe(0);
    expect(missing.missingSenseIds).toContain(socCenterId);

    const rebuilt = await rebuildSenseSearchIndex(prisma);
    expect(rebuilt.rebuiltCount).toBe(2);

    const restored = await getSenseSearchCoverage(prisma, { limit: 10 });
    expect(restored.indexedSenses).toBe(2);
    expect(restored.missingSenseIds).toEqual([]);
    expect(restored.orphanedSenseIds).toEqual([]);

    await prisma.$executeRawUnsafe('DELETE FROM sense_search');
    const partial = await rebuildSenseSearchIndex(prisma, {
      entryIds: [entryId],
    });
    expect(partial.rebuiltCount).toBe(2);

    expect(await rebuildSenseSearchIndex(prisma, { entryIds: [] })).toEqual({
      rebuiltCount: 0,
    });
    expect(
      await rebuildSenseSearchIndex(prisma, {
        entryIds: ["not-a-uuid'; DROP TABLE senses;--"],
      }),
    ).toEqual({ rebuiltCount: 0 });
  });
});
