import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../client.js';
import {
  createIntegrationTestDatabase,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  AUTO_TAG_DEFINITIONS,
  collectAutoTagSlugsForDocument,
  ensureMissingAutoTagDefinitions,
  syncAutoTagsForPublishedEntry,
} from './autoTagging.js';

const prisma = createPrismaClient(createIntegrationTestDatabase());

describe('auto tagging integration', () => {
  beforeAll(async () => {
    await resetIntegrationDatabase(prisma);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes the same curated tag catalog used by scripts', () => {
    expect(AUTO_TAG_DEFINITIONS.length).toBeGreaterThan(10);
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain('identity');
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain(
      'application-security',
    );
  });

  it('collects matching slugs from a real search document', async () => {
    const entry = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Authentication Test',
        normalizedTitle: 'authentication test',
        primarySlug: 'authentication-test',
        status: 'PUBLISHED',
        summaryMd:
          'Authentication tokens can be stolen through phishing and SSRF chains.',
        summaryText:
          'Authentication tokens can be stolen through phishing and SSRF chains.',
      },
      select: { id: true },
    });

    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        definitionMd: 'A SIEM alert helped incident response teams investigate the compromise.',
        definitionText:
          'A SIEM alert helped incident response teams investigate the compromise.',
        status: 'PUBLISHED',
      },
    });

    const searchRow = await prisma.entrySearch.findUniqueOrThrow({
      where: { entryId: entry.id },
      select: { searchDocument: true },
    });

    expect(collectAutoTagSlugsForDocument(searchRow.searchDocument)).toEqual([
      'identity',
      'application-security',
      'threats',
      'security-operations',
      'incident-response',
    ]);
  });

  it('creates only missing active tag definitions and does not revive deleted tags', async () => {
    await prisma.tag.create({
      data: {
        name: 'Curated Identity',
        slug: 'identity',
        description: 'Custom curator-owned description',
      },
    });

    await prisma.tag.create({
      data: {
        name: 'Deleted Privacy',
        slug: 'privacy',
        description: 'Should stay deleted',
        deletedAt: new Date('2026-03-24T00:00:00.000Z'),
      },
    });

    const created = await ensureMissingAutoTagDefinitions(prisma, {
      slugs: ['identity', 'privacy', 'application-security'],
    });

    const identity = await prisma.tag.findFirstOrThrow({
      where: { slug: 'identity' },
      select: { name: true, description: true, deletedAt: true },
    });
    const privacy = await prisma.tag.findFirstOrThrow({
      where: { slug: 'privacy' },
      select: { deletedAt: true },
    });
    const appSec = await prisma.tag.findFirstOrThrow({
      where: { slug: 'application-security', deletedAt: null },
      select: { slug: true },
    });

    expect(identity).toMatchObject({
      name: 'Curated Identity',
      description: 'Custom curator-owned description',
      deletedAt: null,
    });
    expect(privacy.deletedAt).not.toBeNull();
    expect(appSec.slug).toBe('application-security');
    expect(created.map((tag) => tag.slug)).toContain('identity');
    expect(created.map((tag) => tag.slug)).toContain('application-security');
    expect(created.map((tag) => tag.slug)).not.toContain('privacy');
  });

  it('does not create auto tags for slugs reserved in tag_slug_history', async () => {
    const tag = await prisma.tag.create({
      data: {
        name: 'Renamed identity',
        slug: 'identity-curated',
        description: 'Curator renamed away from catalog slug',
      },
      select: { id: true },
    });
    await prisma.tagSlugHistory.create({
      data: { tagId: tag.id, slug: 'identity' },
    });

    const created = await ensureMissingAutoTagDefinitions(prisma, { slugs: ['identity'] });
    expect(created.map((t) => t.slug)).not.toContain('identity');
    const ghost = await prisma.tag.findFirst({
      where: { slug: 'identity', deletedAt: null },
      select: { id: true },
    });
    expect(ghost).toBeNull();
  });

  it('syncs entry tag links using the live search index without mutating curated tags', async () => {
    const identityTag = await prisma.tag.create({
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

    const entry = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Authentication Link Test',
        normalizedTitle: 'authentication link test',
        primarySlug: 'authentication-link-test',
        status: 'PUBLISHED',
        summaryMd: 'Authentication and token handling.',
        summaryText: 'Authentication and token handling.',
      },
      select: { id: true },
    });

    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        definitionMd: 'A web vulnerability can expose authentication tokens.',
        definitionText: 'A web vulnerability can expose authentication tokens.',
        status: 'PUBLISHED',
      },
    });

    const result = await syncAutoTagsForPublishedEntry(prisma, { entryId: entry.id });
    const entryTags = await prisma.entryTag.findMany({
      where: { entryId: entry.id },
      select: { tagId: true },
    });
    const identity = await prisma.tag.findUniqueOrThrow({
      where: { id: identityTag.id },
      select: { name: true, description: true },
    });
    const activeAppSec = await prisma.tag.findMany({
      where: { slug: 'application-security', deletedAt: null },
      select: { id: true },
    });

    expect(result.matchedSlugs).toContain('identity');
    expect(entryTags.map((row) => row.tagId)).toContain(identityTag.id);
    expect(identity).toEqual({
      name: 'Curated Identity',
      description: 'Keep me intact',
    });
    expect(activeAppSec).toHaveLength(0);
  });
});
