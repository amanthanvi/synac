import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIntegrationTestClient, resetIntegrationDatabase } from '../testing.js';
import { getSearchIndexCoverage, rebuildSearchIndex } from './searchIndex.js';

const prisma = createIntegrationTestClient();

async function createPublishedEntry(input: { slug: string; title: string; definition: string }) {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.definition,
      summaryText: input.definition,
    },
    select: { id: true },
  });

  await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      definitionMd: input.definition,
      definitionText: input.definition,
      status: 'PUBLISHED',
    },
  });

  return entry;
}

describe('search index helpers', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports coverage for real published, missing, and orphaned search rows', async () => {
    const indexedEntry = await createPublishedEntry({
      slug: 'authentication',
      title: 'Authentication',
      definition: 'Authentication verifies an identity.',
    });
    const missingEntry = await createPublishedEntry({
      slug: 'authorization',
      title: 'Authorization',
      definition: 'Authorization grants permissions.',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: missingEntry.id } });
    await prisma.entry.update({
      where: { id: indexedEntry.id },
      data: { status: 'ARCHIVED' },
    });
    await prisma.$executeRawUnsafe(`
      INSERT INTO entry_search (
        entry_id,
        entry_type,
        normalized_title,
        primary_slug,
        search_document,
        updated_at
      ) VALUES (
        '${indexedEntry.id}'::uuid,
        'TERM'::"EntryType",
        'authentication',
        'authentication',
        'authentication verifies an identity',
        NOW()
      )
      ON CONFLICT (entry_id) DO UPDATE SET
        entry_type = EXCLUDED.entry_type,
        normalized_title = EXCLUDED.normalized_title,
        primary_slug = EXCLUDED.primary_slug,
        search_document = EXCLUDED.search_document,
        updated_at = NOW()
    `);

    const coverage = await getSearchIndexCoverage(prisma, { limit: 25 });

    expect(coverage.publishedEntries).toBe(1);
    expect(coverage.indexedEntries).toBe(1);
    expect(coverage.missingEntryIds).toContain(missingEntry.id);
    expect(coverage.orphanedEntryIds).toContain(indexedEntry.id);
  });

  it('does not full-rebuild when entryIds is an explicit empty array', async () => {
    const entry = await createPublishedEntry({
      slug: 'empty-ids-array',
      title: 'Empty ids',
      definition: 'No work when the caller passes [].',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: entry.id } });

    const result = await rebuildSearchIndex(prisma, { entryIds: [] });

    expect(result).toEqual({ rebuiltCount: 0 });
    expect(await prisma.entrySearch.findUnique({ where: { entryId: entry.id } })).toBeNull();
  });

  it('returns zero rebuilt count for invalid entry id strings', async () => {
    await createPublishedEntry({
      slug: 'uuid-test',
      title: 'UUID test',
      definition: 'Coverage for invalid id inputs.',
    });

    const result = await rebuildSearchIndex(prisma, { entryIds: ["not-a-uuid'; DROP TABLE entries;--"] });
    expect(result).toEqual({ rebuiltCount: 0 });
  });

  it('rebuilds only the requested entry ids when provided', async () => {
    const firstEntry = await createPublishedEntry({
      slug: 'integrity',
      title: 'Integrity',
      definition: 'Integrity protects data from unauthorized changes.',
    });
    const secondEntry = await createPublishedEntry({
      slug: 'availability',
      title: 'Availability',
      definition: 'Availability keeps systems accessible.',
    });

    await prisma.entrySearch.deleteMany({
      where: { entryId: { in: [firstEntry.id, secondEntry.id] } },
    });

    const result = await rebuildSearchIndex(prisma, { entryIds: [firstEntry.id] });

    expect(result).toEqual({ rebuiltCount: 1 });
    expect(await prisma.entrySearch.findUnique({ where: { entryId: firstEntry.id } })).not.toBeNull();
    expect(await prisma.entrySearch.findUnique({ where: { entryId: secondEntry.id } })).toBeNull();
  });

  it('full rebuild targets published entries only', async () => {
    const published = await createPublishedEntry({
      slug: 'published-only',
      title: 'Published only',
      definition: 'Included in full rebuild.',
    });
    await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Draft row',
        normalizedTitle: 'draft row',
        primarySlug: 'draft-row',
        status: 'DRAFT',
        summaryMd: 'draft',
        summaryText: 'draft',
      },
      select: { id: true },
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: published.id } });

    const result = await rebuildSearchIndex(prisma);

    expect(result).toEqual({ rebuiltCount: 1 });
    expect(await prisma.entrySearch.findUnique({ where: { entryId: published.id } })).not.toBeNull();
  });

  it('full rebuild clears orphaned rows while restoring published rows', async () => {
    const published = await createPublishedEntry({
      slug: 'rebuild-clears-orphans',
      title: 'Rebuild clears orphans',
      definition: 'Published entries should be restored.',
    });
    const archived = await createPublishedEntry({
      slug: 'archived-orphan',
      title: 'Archived orphan',
      definition: 'This row should be removed from the index.',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: published.id } });
    await prisma.entry.update({
      where: { id: archived.id },
      data: { status: 'ARCHIVED' },
    });
    await prisma.$executeRawUnsafe(`
      INSERT INTO entry_search (
        entry_id,
        entry_type,
        normalized_title,
        primary_slug,
        search_document,
        updated_at
      ) VALUES (
        '${archived.id}'::uuid,
        'TERM'::"EntryType",
        'archived orphan',
        'archived-orphan',
        'archived orphan should not stay searchable',
        NOW()
      )
      ON CONFLICT (entry_id) DO UPDATE SET
        entry_type = EXCLUDED.entry_type,
        normalized_title = EXCLUDED.normalized_title,
        primary_slug = EXCLUDED.primary_slug,
        search_document = EXCLUDED.search_document,
        updated_at = NOW()
    `);

    const result = await rebuildSearchIndex(prisma);

    expect(result).toEqual({ rebuiltCount: 1 });
    expect(await prisma.entrySearch.findUnique({ where: { entryId: published.id } })).not.toBeNull();
    expect(await prisma.entrySearch.findUnique({ where: { entryId: archived.id } })).toBeNull();
  });

  it('rebuilds the full published corpus when ids are omitted', async () => {
    const firstEntry = await createPublishedEntry({
      slug: 'confidentiality',
      title: 'Confidentiality',
      definition: 'Confidentiality protects information from disclosure.',
    });
    const secondEntry = await createPublishedEntry({
      slug: 'cia-triad',
      title: 'CIA Triad',
      definition: 'The CIA triad covers confidentiality, integrity, and availability.',
    });

    await prisma.entrySearch.deleteMany({
      where: { entryId: { in: [firstEntry.id, secondEntry.id] } },
    });

    const result = await rebuildSearchIndex(prisma);

    expect(result).toEqual({ rebuiltCount: 2 });
    expect(await prisma.entrySearch.findUnique({ where: { entryId: firstEntry.id } })).not.toBeNull();
    expect(await prisma.entrySearch.findUnique({ where: { entryId: secondEntry.id } })).not.toBeNull();
  });
});
