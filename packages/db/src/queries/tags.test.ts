import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  countPublishedEntriesForTag,
  listPublishedEntriesForTag,
  listTagTree,
  listTags,
  resolveTagBySlug,
} from './tags.js';

const prisma = createIntegrationTestClient();

async function createEntry(title: string, slug: string): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: title,
      normalizedTitle: title.toLowerCase(),
      primarySlug: slug,
      status: 'PUBLISHED',
      summaryMd: `${title} summary.`,
      summaryText: `${title} summary.`,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  return entry.id;
}

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('tag queries', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('splits published entry counts by how the link was assigned', async () => {
    const tag = await prisma.tag.create({
      data: { name: 'Identity', slug: 'identity', kind: 'DOMAIN' },
      select: { id: true },
    });

    const editorial = await createEntry('Authentication', 'authentication');
    const auto = await createEntry('Authorization', 'authorization');
    const ingest = await createEntry('Federation', 'federation');
    const draft = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Draft',
        normalizedTitle: 'draft',
        primarySlug: 'draft',
        status: 'DRAFT',
        summaryMd: 'draft',
        summaryText: 'draft',
      },
      select: { id: true },
    });

    await prisma.entryTag.createMany({
      data: [
        { entryId: editorial, tagId: tag.id, assignedBy: 'EDITORIAL' },
        { entryId: auto, tagId: tag.id, assignedBy: 'AUTO' },
        { entryId: ingest, tagId: tag.id, assignedBy: 'INGEST' },
        { entryId: draft.id, tagId: tag.id, assignedBy: 'AUTO' },
      ],
    });

    const [listed] = await listTags(prisma);

    expect(listed?.kind).toBe('DOMAIN');
    expect(listed?.parentId).toBeNull();
    expect(listed?.entryCount).toBe(3);
    expect(listed?.editorialEntryCount).toBe(1);
    expect(listed?.autoEntryCount).toBe(1);
    expect(listed?.ingestEntryCount).toBe(1);
  });

  it('builds a tag tree from parent links', async () => {
    const parent = await prisma.tag.create({
      data: { name: 'Identity', slug: 'identity', kind: 'DOMAIN' },
      select: { id: true },
    });
    await prisma.tag.create({
      data: {
        name: 'Federation',
        slug: 'federation',
        kind: 'FACET',
        parentId: parent.id,
      },
    });
    await prisma.tag.create({ data: { name: 'Privacy', slug: 'privacy' } });

    const tree = await listTagTree(prisma);

    expect(tree.map((node) => node.slug)).toEqual(['identity', 'privacy']);
    expect(tree[0]?.children.map((node) => node.slug)).toEqual(['federation']);
    expect(tree[1]?.children).toEqual([]);
  });

  it('excludes soft-deleted tags from entry listings and counts', async () => {
    const tag = await prisma.tag.create({
      data: { name: 'Retired', slug: 'retired' },
      select: { id: true },
    });
    const entryId = await createEntry('Authentication', 'authentication');
    await prisma.entryTag.create({
      data: { entryId, tagId: tag.id, assignedBy: 'EDITORIAL' },
    });

    expect(
      await listPublishedEntriesForTag(prisma, {
        tagId: tag.id,
        page: 1,
        pageSize: 10,
      }),
    ).toHaveLength(1);
    expect(await countPublishedEntriesForTag(prisma, { tagId: tag.id })).toBe(
      1,
    );

    await prisma.tag.update({
      where: { id: tag.id },
      data: { deletedAt: new Date() },
    });

    expect(
      await listPublishedEntriesForTag(prisma, {
        tagId: tag.id,
        page: 1,
        pageSize: 10,
      }),
    ).toEqual([]);
    expect(await countPublishedEntriesForTag(prisma, { tagId: tag.id })).toBe(
      0,
    );
    expect(await listTags(prisma)).toEqual([]);
    expect(await resolveTagBySlug(prisma, { slug: 'retired' })).toBeNull();
  });

  it('filters entry listings by assignment origin and entry type', async () => {
    const tag = await prisma.tag.create({
      data: { name: 'Identity', slug: 'identity' },
      select: { id: true },
    });
    const editorialEntry = await createEntry(
      'Authentication',
      'authentication',
    );
    const autoEntry = await createEntry('Authorization', 'authorization');
    const acronym = await prisma.entry.create({
      data: {
        entryType: 'ACRONYM',
        displayTitle: 'MFA',
        normalizedTitle: 'mfa',
        primarySlug: 'mfa',
        status: 'PUBLISHED',
        summaryMd: 'Multi-factor authentication.',
        summaryText: 'Multi-factor authentication.',
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.entryTag.createMany({
      data: [
        { entryId: editorialEntry, tagId: tag.id, assignedBy: 'EDITORIAL' },
        { entryId: autoEntry, tagId: tag.id, assignedBy: 'AUTO' },
        { entryId: acronym.id, tagId: tag.id, assignedBy: 'EDITORIAL' },
      ],
    });

    const editorialOnly = await listPublishedEntriesForTag(prisma, {
      tagId: tag.id,
      assignedBy: 'EDITORIAL',
      page: 1,
      pageSize: 10,
    });
    expect(editorialOnly.map((row) => row.primarySlug).sort()).toEqual([
      'authentication',
      'mfa',
    ]);

    const termsOnly = await listPublishedEntriesForTag(prisma, {
      tagId: tag.id,
      entryType: 'TERM',
      page: 1,
      pageSize: 10,
    });
    expect(termsOnly.map((row) => row.primarySlug).sort()).toEqual([
      'authentication',
      'authorization',
    ]);

    expect(
      await countPublishedEntriesForTag(prisma, {
        tagId: tag.id,
        assignedBy: 'AUTO',
      }),
    ).toBe(1);
  });

  it('redirects from a historical tag slug to the canonical one', async () => {
    const tag = await prisma.tag.create({
      data: { name: 'Identity', slug: 'identity' },
      select: { id: true },
    });
    await prisma.tagSlugHistory.create({
      data: { tagId: tag.id, slug: 'identities' },
    });

    const resolved = await resolveTagBySlug(prisma, { slug: 'identities' });

    expect(resolved?.canonicalSlug).toBe('identity');
    expect(resolved?.needsRedirect).toBe(true);
  });
});
