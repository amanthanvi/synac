import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  AUTO_TAG_DEFINITIONS,
  AUTO_TAG_THRESHOLD,
  collectAutoTagMatchesForDocument,
  collectAutoTagSlugsForDocument,
  ensureMissingAutoTagDefinitions,
  syncAutoTagsForPublishedEntry,
} from './autoTagging.js';

const prisma = createIntegrationTestClient();

async function createPublishedEntry(input: {
  title: string;
  slug: string;
  summary: string;
  definition: string;
}): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.summary,
      summaryText: input.summary,
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      slug: 'sense-1',
      definitionMd: input.definition,
      definitionText: input.definition,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  return entry.id;
}

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('auto tag matching rules', () => {
  it('exposes the curated tag catalog used by the backfill script', () => {
    expect(AUTO_TAG_THRESHOLD).toBe(2);
    expect(AUTO_TAG_DEFINITIONS.length).toBeGreaterThan(10);
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain(
      'identity',
    );
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain(
      'application-security',
    );
  });

  it('requires two generic hits or one specific phrase', () => {
    expect(
      collectAutoTagSlugsForDocument('Network traffic is inspected.'),
    ).toEqual([]);
    expect(
      collectAutoTagSlugsForDocument('A network firewall inspects traffic.'),
    ).toEqual(['network-security']);
    expect(
      collectAutoTagSlugsForDocument('Firewall rules are ordered.'),
    ).toEqual(['network-security']);

    const matches = collectAutoTagMatchesForDocument(
      'A network firewall inspects packets before routing them.',
    );
    expect(matches[0]?.slug).toBe('network-security');
    expect(matches[0]?.score).toBeGreaterThanOrEqual(AUTO_TAG_THRESHOLD);
  });

  it('no longer tags on bare common English words', () => {
    const noise =
      'The host writes a log entry when the policy control token session monitor package runs.';
    expect(collectAutoTagSlugsForDocument(noise)).toEqual([]);

    expect(
      collectAutoTagSlugsForDocument('There is a risk to consider.'),
    ).toEqual([]);
    expect(collectAutoTagSlugsForDocument('An attack happened.')).toEqual([]);
  });

  it('strips markdown before matching', () => {
    expect(
      collectAutoTagSlugsForDocument(
        '**Firewall** rules use `iptables` under the hood.',
      ),
    ).toEqual(['network-security']);
  });

  it('matches multi-signal security content', () => {
    expect(
      collectAutoTagSlugsForDocument(
        'Multi-factor authentication (MFA) confirms a claimed identity before access is granted.',
      ),
    ).toContain('identity');

    expect(
      collectAutoTagSlugsForDocument(
        'A SQL injection lets an attacker run arbitrary queries.',
      ),
    ).toContain('application-security');
  });
});

describe('auto tag definitions', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
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

    expect(identity).toMatchObject({
      name: 'Curated Identity',
      description: 'Custom curator-owned description',
      deletedAt: null,
    });
    expect(privacy.deletedAt).not.toBeNull();
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

    const created = await ensureMissingAutoTagDefinitions(prisma, {
      slugs: ['identity'],
    });
    expect(created.map((t) => t.slug)).not.toContain('identity');
    expect(
      await prisma.tag.findFirst({
        where: { slug: 'identity', deletedAt: null },
      }),
    ).toBeNull();
  });
});

describe('syncAutoTagsForPublishedEntry', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('never creates tag rows unless ensureDefinitions is explicitly true', async () => {
    const entryId = await createPublishedEntry({
      title: 'Perimeter defense',
      slug: 'perimeter-defense',
      summary: 'A network firewall inspects packets at the boundary.',
      definition: 'Firewall policies decide which packets may cross.',
    });

    const withoutDefinitions = await syncAutoTagsForPublishedEntry(prisma, {
      entryId,
    });

    expect(withoutDefinitions).toEqual({
      added: 0,
      removed: 0,
      matchedSlugs: [],
    });
    expect(await prisma.tag.count()).toBe(0);

    const withDefinitions = await syncAutoTagsForPublishedEntry(prisma, {
      entryId,
      ensureDefinitions: true,
    });

    expect(withDefinitions.matchedSlugs).toEqual(['network-security']);
    expect(withDefinitions.added).toBe(1);

    const links = await prisma.entryTag.findMany({
      where: { entryId },
      select: { assignedBy: true, tag: { select: { slug: true } } },
    });
    expect(links).toEqual([
      { assignedBy: 'AUTO', tag: { slug: 'network-security' } },
    ]);
  });

  it('removes stale AUTO links but never touches EDITORIAL or INGEST links', async () => {
    const network = await prisma.tag.create({
      data: { name: 'Network Security', slug: 'network-security' },
      select: { id: true },
    });
    const curated = await prisma.tag.create({
      data: { name: 'Fundamentals', slug: 'fundamentals' },
      select: { id: true },
    });
    const imported = await prisma.tag.create({
      data: { name: 'Privacy', slug: 'privacy' },
      select: { id: true },
    });

    const entryId = await createPublishedEntry({
      title: 'Perimeter defense',
      slug: 'perimeter-defense',
      summary: 'A network firewall inspects packets at the boundary.',
      definition: 'Firewall policies decide which packets may cross.',
    });

    await prisma.entryTag.createMany({
      data: [
        { entryId, tagId: curated.id, assignedBy: 'EDITORIAL' },
        { entryId, tagId: imported.id, assignedBy: 'INGEST' },
      ],
    });

    const first = await syncAutoTagsForPublishedEntry(prisma, { entryId });
    expect(first.matchedSlugs).toEqual(['network-security']);
    expect(first.added).toBe(1);

    const sense = await prisma.sense.findFirstOrThrow({
      where: { entryId },
      select: { id: true },
    });
    await prisma.entry.update({
      where: { id: entryId },
      data: {
        summaryMd: 'Orchards and soil conditions.',
        summaryText: 'Orchards and soil conditions.',
        displayTitle: 'Orchard care',
        normalizedTitle: 'orchard care',
      },
    });
    await prisma.sense.update({
      where: { id: sense.id },
      data: {
        definitionMd: 'Fruit trees and seasonal harvests.',
        definitionText: 'Fruit trees and seasonal harvests.',
      },
    });

    const second = await syncAutoTagsForPublishedEntry(prisma, { entryId });
    expect(second).toEqual({ added: 0, removed: 1, matchedSlugs: [] });

    const remaining = await prisma.entryTag.findMany({
      where: { entryId },
      select: { tagId: true, assignedBy: true },
    });

    expect(remaining).toHaveLength(2);
    expect(remaining.map((row) => row.tagId).sort()).toEqual(
      [curated.id, imported.id].sort(),
    );
    expect(remaining.map((row) => row.assignedBy).sort()).toEqual([
      'EDITORIAL',
      'INGEST',
    ]);
    expect(remaining.map((row) => row.tagId)).not.toContain(network.id);
  });

  it('leaves an EDITORIAL link alone when the same tag also matches automatically', async () => {
    const network = await prisma.tag.create({
      data: { name: 'Network Security', slug: 'network-security' },
      select: { id: true },
    });

    const entryId = await createPublishedEntry({
      title: 'Perimeter defense',
      slug: 'perimeter-defense',
      summary: 'A network firewall inspects packets at the boundary.',
      definition: 'Firewall policies decide which packets may cross.',
    });

    await prisma.entryTag.create({
      data: { entryId, tagId: network.id, assignedBy: 'EDITORIAL' },
    });

    const result = await syncAutoTagsForPublishedEntry(prisma, { entryId });

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);

    const links = await prisma.entryTag.findMany({
      where: { entryId },
      select: { assignedBy: true },
    });
    expect(links).toEqual([{ assignedBy: 'EDITORIAL' }]);
  });

  it('ignores tags outside the auto catalog', async () => {
    const manual = await prisma.tag.create({
      data: { name: 'Manual tag', slug: 'manual-tag' },
      select: { id: true },
    });

    const entryId = await createPublishedEntry({
      title: 'Orchard care',
      slug: 'orchard-care',
      summary: 'Orchards and soil conditions.',
      definition: 'Fruit trees and seasonal harvests.',
    });

    await prisma.entryTag.create({
      data: { entryId, tagId: manual.id, assignedBy: 'AUTO' },
    });

    const result = await syncAutoTagsForPublishedEntry(prisma, { entryId });

    expect(result).toEqual({ added: 0, removed: 0, matchedSlugs: [] });
    expect(await prisma.entryTag.count({ where: { entryId } })).toBe(1);
  });
});
