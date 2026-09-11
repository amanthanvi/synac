import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  listRecentPublishedEntries,
  resolvePublishedEntryBySlug,
} from './entries.js';

const prisma = createIntegrationTestClient();

async function createEntry(input: {
  title: string;
  slug: string;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
}): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: input.status,
      summaryMd: `${input.title} summary.`,
      summaryText: `${input.title} summary.`,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
    },
    select: { id: true },
  });
  return entry.id;
}

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('resolvePublishedEntryBySlug', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('resolves the canonical slug without a redirect', async () => {
    const id = await createEntry({
      title: 'Authentication',
      slug: 'authentication',
      status: 'PUBLISHED',
    });

    const resolved = await resolvePublishedEntryBySlug(prisma, {
      entryType: 'TERM',
      slug: 'Authentication',
    });

    expect(resolved?.entry.id).toBe(id);
    expect(resolved?.canonicalSlug).toBe('authentication');
    expect(resolved?.needsRedirect).toBe(false);
  });

  it('follows slug history and asks for a redirect', async () => {
    const id = await createEntry({
      title: 'Multi-Factor Authentication',
      slug: 'multi-factor-authentication',
      status: 'PUBLISHED',
    });

    await prisma.entrySlugHistory.create({
      data: { entryId: id, entryType: 'TERM', slug: 'mfa-old-slug' },
    });

    const resolved = await resolvePublishedEntryBySlug(prisma, {
      entryType: 'TERM',
      slug: 'mfa-old-slug',
    });

    expect(resolved?.entry.id).toBe(id);
    expect(resolved?.canonicalSlug).toBe('multi-factor-authentication');
    expect(resolved?.needsRedirect).toBe(true);
  });

  it('returns null for unpublished, soft-deleted, and unknown slugs', async () => {
    const draftId = await createEntry({
      title: 'Draft',
      slug: 'draft',
      status: 'DRAFT',
    });
    await prisma.entrySlugHistory.create({
      data: { entryId: draftId, entryType: 'TERM', slug: 'draft-old' },
    });

    const deletedId = await createEntry({
      title: 'Retired',
      slug: 'retired',
      status: 'PUBLISHED',
    });
    await prisma.entry.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });

    expect(
      await resolvePublishedEntryBySlug(prisma, {
        entryType: 'TERM',
        slug: 'draft',
      }),
    ).toBeNull();
    expect(
      await resolvePublishedEntryBySlug(prisma, {
        entryType: 'TERM',
        slug: 'draft-old',
      }),
    ).toBeNull();
    expect(
      await resolvePublishedEntryBySlug(prisma, {
        entryType: 'TERM',
        slug: 'retired',
      }),
    ).toBeNull();
    expect(
      await resolvePublishedEntryBySlug(prisma, {
        entryType: 'TERM',
        slug: 'nothing-here',
      }),
    ).toBeNull();
  });

  it('does not resolve a slug that belongs to the other entry type', async () => {
    await createEntry({ title: 'SOC', slug: 'soc', status: 'PUBLISHED' });

    expect(
      await resolvePublishedEntryBySlug(prisma, {
        entryType: 'ACRONYM',
        slug: 'soc',
      }),
    ).toBeNull();
  });
});

describe('listRecentPublishedEntries', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('lists only published entries, newest first, with pagination', async () => {
    await createEntry({ title: 'First', slug: 'first', status: 'PUBLISHED' });
    await createEntry({ title: 'Second', slug: 'second', status: 'PUBLISHED' });
    await createEntry({ title: 'Hidden', slug: 'hidden', status: 'DRAFT' });

    const all = await listRecentPublishedEntries(prisma, {
      page: 1,
      pageSize: 10,
    });
    expect(all.map((row) => row.primarySlug).sort()).toEqual([
      'first',
      'second',
    ]);

    const firstPage = await listRecentPublishedEntries(prisma, {
      page: 1,
      pageSize: 1,
    });
    const secondPage = await listRecentPublishedEntries(prisma, {
      page: 2,
      pageSize: 1,
    });

    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(firstPage[0]?.id).not.toBe(secondPage[0]?.id);
  });
});
