import '../test.setup';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { createTag, mergeTags, updateTag } from './adminTags';

const prisma = createIntegrationTestClient();

/** A syntactically valid uuid that intentionally matches no user row. */
const MISSING_ACTOR_ID = '99999999-8888-4777-8666-555555555555';

async function createActor(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: 'editor@example.com',
      authProvider: 'LOCAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return user.id;
}

async function createPublishedEntry(slug: string): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: slug,
      normalizedTitle: slug,
      primarySlug: slug,
      status: 'PUBLISHED',
      summaryMd: 'Summary.',
      summaryText: 'Summary.',
    },
    select: { id: true },
  });
  return entry.id;
}

describe('mergeTags', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('transfers entry links, slug history, and children, and audits the merge', async () => {
    const actorUserId = await createActor();

    const { tagId: fromTagId } = await createTag({
      actorUserId,
      name: 'Cloud Sec',
    });
    const { tagId: intoTagId } = await createTag({
      actorUserId,
      name: 'Cloud Security',
    });
    const { tagId: childTagId } = await createTag({
      actorUserId,
      name: 'Cloud IAM',
    });

    // Give the source tag a slug history entry by renaming it.
    await updateTag({
      actorUserId,
      tagId: fromTagId,
      name: 'Cloud Sec',
      slug: 'cloudsec',
    });
    await prisma.tag.update({
      where: { id: childTagId },
      data: { parentId: fromTagId },
    });

    const sharedEntryId = await createPublishedEntry('shared-entry');
    const onlyFromEntryId = await createPublishedEntry('from-only-entry');

    await prisma.entryTag.createMany({
      data: [
        { entryId: sharedEntryId, tagId: fromTagId, assignedBy: 'AUTO' },
        { entryId: sharedEntryId, tagId: intoTagId, assignedBy: 'EDITORIAL' },
        { entryId: onlyFromEntryId, tagId: fromTagId, assignedBy: 'EDITORIAL' },
      ],
    });

    await mergeTags({ actorUserId, fromTagId, intoTagId });

    const remainingFromLinks = await prisma.entryTag.findMany({
      where: { tagId: fromTagId },
    });
    expect(remainingFromLinks).toHaveLength(0);

    const intoLinks = await prisma.entryTag.findMany({
      where: { tagId: intoTagId },
      select: { entryId: true, assignedBy: true },
      orderBy: [{ entryId: 'asc' }],
    });
    expect(intoLinks.map((l) => l.entryId).sort()).toEqual(
      [sharedEntryId, onlyFromEntryId].sort(),
    );

    // Both the old slug and its history now point at the surviving tag, so old
    // links keep resolving.
    const history = await prisma.tagSlugHistory.findMany({
      where: { tagId: intoTagId },
      select: { slug: true },
    });
    const slugs = history.map((h) => h.slug).sort();
    expect(slugs).toContain('cloud-sec');
    expect(slugs).toContain('cloudsec');

    const child = await prisma.tag.findUniqueOrThrow({
      where: { id: childTagId },
    });
    expect(child.parentId).toBe(intoTagId);

    const deleted = await prisma.tag.findUniqueOrThrow({
      where: { id: fromTagId },
    });
    expect(deleted.deletedAt).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'TAG_MERGE', entityId: fromTagId },
    });
    expect(audit).not.toBeNull();
  });

  it('writes the audit event inside the same transaction as the merge', async () => {
    const actorUserId = await createActor();

    const { tagId: fromTagId } = await createTag({
      actorUserId,
      name: 'Alpha',
    });
    const { tagId: intoTagId } = await createTag({ actorUserId, name: 'Beta' });

    const entryId = await createPublishedEntry('alpha-entry');
    await prisma.entryTag.create({ data: { entryId, tagId: fromTagId } });

    // An actor id with no matching user row makes the audit insert fail on its
    // foreign key, after the links have already moved. If the audit write lived
    // outside the transaction, the link transfer would have committed anyway.
    await expect(
      mergeTags({ actorUserId: MISSING_ACTOR_ID, fromTagId, intoTagId }),
    ).rejects.toThrow();

    const fromLinks = await prisma.entryTag.findMany({
      where: { tagId: fromTagId },
    });
    expect(fromLinks).toHaveLength(1);

    const intoLinks = await prisma.entryTag.findMany({
      where: { tagId: intoTagId },
    });
    expect(intoLinks).toHaveLength(0);

    const stillAlive = await prisma.tag.findUniqueOrThrow({
      where: { id: fromTagId },
    });
    expect(stillAlive.deletedAt).toBeNull();

    const transferredHistory = await prisma.tagSlugHistory.findMany({
      where: { tagId: intoTagId },
    });
    expect(transferredHistory).toHaveLength(0);
  });

  it('refuses to merge a tag into itself', async () => {
    const actorUserId = await createActor();
    const { tagId } = await createTag({ actorUserId, name: 'Solo' });

    await expect(
      mergeTags({ actorUserId, fromTagId: tagId, intoTagId: tagId }),
    ).rejects.toThrow(/into itself/i);
  });

  it('reports a missing tag rather than silently succeeding', async () => {
    const actorUserId = await createActor();
    const { tagId } = await createTag({ actorUserId, name: 'Solo' });

    await expect(
      mergeTags({
        actorUserId,
        fromTagId: tagId,
        intoTagId: '11111111-2222-4333-8444-555555555555',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('updateTag', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('records the previous slug in history so old links keep resolving', async () => {
    const actorUserId = await createActor();
    const { tagId } = await createTag({ actorUserId, name: 'Net Sec' });

    await updateTag({
      actorUserId,
      tagId,
      name: 'Network Security',
      slug: 'network-security',
    });

    const history = await prisma.tagSlugHistory.findMany({
      where: { tagId },
      select: { slug: true },
    });
    expect(history.map((h) => h.slug)).toContain('net-sec');

    const tag = await prisma.tag.findUniqueOrThrow({ where: { id: tagId } });
    expect(tag.slug).toBe('network-security');
  });

  it('refuses a slug already reserved by another tag', async () => {
    const actorUserId = await createActor();
    await createTag({ actorUserId, name: 'Taken' });
    const { tagId } = await createTag({ actorUserId, name: 'Other' });

    await expect(
      updateTag({ actorUserId, tagId, name: 'Other', slug: 'taken' }),
    ).rejects.toThrow(/already exists|reserved/i);
  });
});
