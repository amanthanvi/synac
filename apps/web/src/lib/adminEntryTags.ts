import { getPrismaClient } from '@synac/db';

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function addTagToEntry(input: {
  actorUserId: string;
  entryId: string;
  tagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const [entry, tag] = await Promise.all([
    prisma.entry.findFirst({ where: { id: input.entryId, deletedAt: null }, select: { id: true } }),
    prisma.tag.findFirst({ where: { id: input.tagId, deletedAt: null }, select: { id: true, slug: true } }),
  ]);

  if (!entry) throw new Error('Entry not found');
  if (!tag) throw new Error('Tag not found');

  try {
    await prisma.entryTag.create({ data: { entryId: entry.id, tagId: tag.id } });
  } catch {
    // ignore duplicates
  }

  await prisma.entry.update({ where: { id: entry.id }, data: { updatedAt: new Date() } });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'ENTRY_TAG_ADD',
      entityType: 'ENTRY',
      entityId: entry.id,
      after: toJsonSafe({ tagId: tag.id, tagSlug: tag.slug }),
    },
  });
}

export async function removeTagFromEntry(input: {
  actorUserId: string;
  entryId: string;
  tagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const entry = await prisma.entry.findFirst({ where: { id: input.entryId, deletedAt: null }, select: { id: true } });
  if (!entry) throw new Error('Entry not found');

  await prisma.entryTag.deleteMany({ where: { entryId: entry.id, tagId: input.tagId } });
  await prisma.entry.update({ where: { id: entry.id }, data: { updatedAt: new Date() } });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'ENTRY_TAG_REMOVE',
      entityType: 'ENTRY',
      entityId: entry.id,
      after: toJsonSafe({ tagId: input.tagId }),
    },
  });
}

