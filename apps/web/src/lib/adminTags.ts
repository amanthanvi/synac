import { getPrismaClient } from '@synac/db';

import { slugify } from '@/lib/text';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireNonEmpty(label: string, value: string): string {
  const v = normalizeWhitespace(value);
  if (!v) throw new Error(`${label} is required`);
  return v;
}

async function assertTagSlugAvailable(input: {
  slug: string;
  allowTagId?: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const existingTag = await prisma.tag.findFirst({
    where: {
      slug: input.slug,
      deletedAt: null,
      ...(input.allowTagId ? { NOT: { id: input.allowTagId } } : {}),
    },
    select: { id: true },
  });
  if (existingTag) {
    throw new Error(`Tag slug already exists: ${input.slug}`);
  }

  const history = await prisma.tagSlugHistory.findFirst({
    where: { slug: input.slug },
    select: { tagId: true },
  });
  if (history && history.tagId !== input.allowTagId) {
    throw new Error(`Tag slug is reserved by history: ${input.slug}`);
  }
}

export async function createTag(input: {
  actorUserId: string;
  name: string;
  slug?: string | null;
  description?: string | null;
}): Promise<{ tagId: string }> {
  const prisma = getPrismaClient();

  const name = requireNonEmpty('Name', input.name);
  const desiredSlug = slugify(input.slug?.trim() ? input.slug : name);
  if (!desiredSlug) throw new Error('Slug is required');

  await assertTagSlugAvailable({ slug: desiredSlug });

  const created = await prisma.tag.create({
    data: {
      name,
      slug: desiredSlug,
      description: input.description?.trim() ? normalizeWhitespace(input.description) : null,
    },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'TAG_CREATE',
      entityType: 'TAG',
      entityId: created.id,
      after: toJsonSafe(created),
    },
  });

  return { tagId: created.id };
}

export async function updateTag(input: {
  actorUserId: string;
  tagId: string;
  name: string;
  slug: string;
  description?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();

  const before = await prisma.tag.findFirst({
    where: { id: input.tagId, deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
  });
  if (!before) throw new Error('Tag not found');

  const name = requireNonEmpty('Name', input.name);
  const desiredSlug = slugify(requireNonEmpty('Slug', input.slug));

  await assertTagSlugAvailable({ slug: desiredSlug, allowTagId: before.id });

  const after = await prisma.$transaction(async (tx) => {
    if (desiredSlug !== before.slug) {
      try {
        await tx.tagSlugHistory.create({ data: { tagId: before.id, slug: before.slug } });
      } catch {
        // ignore (already exists or reserved)
      }
    }

    return tx.tag.update({
      where: { id: before.id },
      data: {
        name,
        slug: desiredSlug,
        description: input.description?.trim() ? normalizeWhitespace(input.description) : null,
      },
      select: { id: true, name: true, slug: true, description: true, updatedAt: true },
    });
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'TAG_UPDATE',
      entityType: 'TAG',
      entityId: before.id,
      before: toJsonSafe(before),
      after: toJsonSafe(after),
    },
  });
}

export async function mergeTags(input: {
  actorUserId: string;
  fromTagId: string;
  intoTagId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  if (input.fromTagId === input.intoTagId) {
    throw new Error('Cannot merge a tag into itself');
  }

  const [fromTag, intoTag] = await Promise.all([
    prisma.tag.findFirst({
      where: { id: input.fromTagId, deletedAt: null },
      select: { id: true, name: true, slug: true, description: true, updatedAt: true },
    }),
    prisma.tag.findFirst({
      where: { id: input.intoTagId, deletedAt: null },
      select: { id: true, name: true, slug: true, description: true, updatedAt: true },
    }),
  ]);

  if (!fromTag) throw new Error('From tag not found');
  if (!intoTag) throw new Error('Into tag not found');

  const result = await prisma.$transaction(async (tx) => {
    const fromSlugs = await tx.tagSlugHistory.findMany({
      where: { tagId: fromTag.id },
      select: { slug: true },
    });

    const entryLinks = await tx.entryTag.findMany({
      where: { tagId: fromTag.id },
      select: { entryId: true },
    });

    if (entryLinks.length) {
      await tx.entryTag.createMany({
        data: entryLinks.map((r) => ({ entryId: r.entryId, tagId: intoTag.id })),
        skipDuplicates: true,
      });
    }

    await tx.entryTag.deleteMany({ where: { tagId: fromTag.id } });

    const slugsToTransfer = Array.from(
      new Set([fromTag.slug, ...fromSlugs.map((s) => s.slug)]),
    );
    for (const slug of slugsToTransfer) {
      await tx.tagSlugHistory.upsert({
        where: { slug },
        update: { tagId: intoTag.id },
        create: { tagId: intoTag.id, slug },
      });
    }

    const deleted = await tx.tag.update({
      where: { id: fromTag.id },
      data: { deletedAt: new Date() },
      select: { id: true, deletedAt: true },
    });

    return { movedEntryCount: entryLinks.length, slugsTransferred: slugsToTransfer.length, deleted };
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'TAG_MERGE',
      entityType: 'TAG',
      entityId: fromTag.id,
      before: toJsonSafe({ fromTag, intoTag }),
      after: toJsonSafe({ intoTagId: intoTag.id, ...result }),
    },
  });
}

