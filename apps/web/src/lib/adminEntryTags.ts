import { getPrismaClient, toJsonSafe } from '@synac/db';

import { revalidateEntry } from '@/lib/cacheTags';

async function revalidateForEntry(entryId: string): Promise<void> {
  const prisma = getPrismaClient();
  const entry = await prisma.entry.findFirst({
    where: { id: entryId },
    select: {
      entryType: true,
      primarySlug: true,
      status: true,
      entryTags: { select: { tag: { select: { slug: true } } } },
    },
  });
  if (!entry || entry.status !== 'PUBLISHED') return;

  revalidateEntry({
    entryType: entry.entryType,
    slug: entry.primarySlug,
    tagSlugs: entry.entryTags.map((link) => link.tag.slug),
  });
}

/**
 * Link a tag to an entry as an editorial decision.
 *
 * Everything an editor adds by hand is `EDITORIAL`, which also pins it: the
 * auto-tagger only ever adds or removes `AUTO` links, so an editorial link
 * survives the next re-tagging pass.
 */
export async function addTagToEntry(input: {
  actorUserId: string;
  entryId: string;
  tagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const [entry, tag] = await Promise.all([
    prisma.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: { id: true },
    }),
    prisma.tag.findFirst({
      where: { id: input.tagId, deletedAt: null },
      select: { id: true, slug: true },
    }),
  ]);

  if (!entry) throw new Error('Entry not found');
  if (!tag) throw new Error('Tag not found');

  await prisma.$transaction(async (tx) => {
    await tx.entryTag.upsert({
      where: { entryId_tagId: { entryId: entry.id, tagId: tag.id } },
      update: { assignedBy: 'EDITORIAL' },
      create: { entryId: entry.id, tagId: tag.id, assignedBy: 'EDITORIAL' },
    });

    await tx.entry.update({
      where: { id: entry.id },
      data: { updatedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_TAG_ADD',
        entityType: 'ENTRY',
        entityId: entry.id,
        after: toJsonSafe({
          tagId: tag.id,
          tagSlug: tag.slug,
          assignedBy: 'EDITORIAL',
        }),
      },
    });
  });

  await revalidateForEntry(entry.id);
}

/**
 * Promote an auto-assigned link to an editorial one. This is how an editor says
 * "the tagger got this right", and pins it against the next auto pass.
 */
export async function pinEntryTagAsEditorial(input: {
  actorUserId: string;
  entryId: string;
  tagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const link = await prisma.entryTag.findFirst({
    where: { entryId: input.entryId, tagId: input.tagId },
    select: {
      entryId: true,
      tagId: true,
      assignedBy: true,
      tag: { select: { slug: true } },
    },
  });
  if (!link) throw new Error('Entry tag not found');
  if (link.assignedBy === 'EDITORIAL') return;

  await prisma.$transaction(async (tx) => {
    await tx.entryTag.update({
      where: { entryId_tagId: { entryId: link.entryId, tagId: link.tagId } },
      data: { assignedBy: 'EDITORIAL' },
    });

    await tx.entry.update({
      where: { id: link.entryId },
      data: { updatedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_TAG_PIN',
        entityType: 'ENTRY',
        entityId: link.entryId,
        before: toJsonSafe({ tagId: link.tagId, assignedBy: link.assignedBy }),
        after: toJsonSafe({
          tagId: link.tagId,
          tagSlug: link.tag.slug,
          assignedBy: 'EDITORIAL',
        }),
      },
    });
  });

  await revalidateForEntry(link.entryId);
}

export async function removeTagFromEntry(input: {
  actorUserId: string;
  entryId: string;
  tagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const entry = await prisma.entry.findFirst({
    where: { id: input.entryId, deletedAt: null },
    select: { id: true },
  });
  if (!entry) throw new Error('Entry not found');

  const existing = await prisma.entryTag.findFirst({
    where: { entryId: entry.id, tagId: input.tagId },
    select: { assignedBy: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.entryTag.deleteMany({
      where: { entryId: entry.id, tagId: input.tagId },
    });
    await tx.entry.update({
      where: { id: entry.id },
      data: { updatedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_TAG_REMOVE',
        entityType: 'ENTRY',
        entityId: entry.id,
        after: toJsonSafe({
          tagId: input.tagId,
          assignedBy: existing?.assignedBy ?? null,
        }),
      },
    });
  });

  await revalidateForEntry(entry.id);
}
