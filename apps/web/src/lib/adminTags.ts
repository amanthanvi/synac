import {
  getPrismaClient,
  normalizeWhitespace,
  requireNonEmpty,
  slugify,
  toJsonSafe,
  type Prisma,
} from '@synac/db';

import { revalidateTagEntity } from '@/lib/cacheTags';

export type TagKindInput = 'DOMAIN' | 'FACET';

async function assertTagSlugAvailable(input: {
  slug: string;
  allowTagId?: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const where: Prisma.TagWhereInput = { slug: input.slug, deletedAt: null };
  if (input.allowTagId) where.NOT = { id: input.allowTagId };

  const existingTag = await prisma.tag.findFirst({
    where,
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

const tagSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  kind: true,
  parentId: true,
  updatedAt: true,
} as const;

export async function createTag(input: {
  actorUserId: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  kind?: TagKindInput;
  parentId?: string | null;
}): Promise<{ tagId: string }> {
  const prisma = getPrismaClient();

  const name = requireNonEmpty('Name', input.name);
  const desiredSlug = slugify(input.slug?.trim() ? input.slug : name);
  if (!desiredSlug) throw new Error('Slug is required');

  await assertTagSlugAvailable({ slug: desiredSlug });

  const created = await prisma.$transaction(async (tx) => {
    const data: Prisma.TagUncheckedCreateInput = {
      name,
      slug: desiredSlug,
      description: input.description?.trim()
        ? normalizeWhitespace(input.description)
        : null,
      parentId: input.parentId?.trim() ? input.parentId.trim() : null,
    };
    if (input.kind) data.kind = input.kind;

    const tag = await tx.tag.create({ data, select: tagSelect });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'TAG_CREATE',
        entityType: 'TAG',
        entityId: tag.id,
        after: toJsonSafe(tag),
      },
    });

    return tag;
  });

  revalidateTagEntity({ slugs: [created.slug] });

  return { tagId: created.id };
}

export async function updateTag(input: {
  actorUserId: string;
  tagId: string;
  name: string;
  slug: string;
  description?: string | null;
  kind?: TagKindInput;
  parentId?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();

  const before = await prisma.tag.findFirst({
    where: { id: input.tagId, deletedAt: null },
    select: tagSelect,
  });
  if (!before) throw new Error('Tag not found');

  const name = requireNonEmpty('Name', input.name);
  const desiredSlug = slugify(requireNonEmpty('Slug', input.slug));

  await assertTagSlugAvailable({ slug: desiredSlug, allowTagId: before.id });

  const parentId = input.parentId?.trim() ? input.parentId.trim() : null;
  if (parentId === before.id)
    throw new Error('Cannot make a tag its own parent');

  // The rename and its audit trail are one unit: an audit log that can record a
  // rename which did not happen is worse than no audit log.
  await prisma.$transaction(async (tx) => {
    if (desiredSlug !== before.slug) {
      await tx.tagSlugHistory.upsert({
        where: { slug: before.slug },
        update: { tagId: before.id },
        create: { tagId: before.id, slug: before.slug },
      });
    }

    const data: Prisma.TagUncheckedUpdateInput = {
      name,
      slug: desiredSlug,
      description: input.description?.trim()
        ? normalizeWhitespace(input.description)
        : null,
      parentId,
    };
    if (input.kind) data.kind = input.kind;

    const after = await tx.tag.update({
      where: { id: before.id },
      data,
      select: tagSelect,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'TAG_UPDATE',
        entityType: 'TAG',
        entityId: before.id,
        before: toJsonSafe(before),
        after: toJsonSafe(after),
      },
    });
  });

  revalidateTagEntity({
    slugs: [before.slug, desiredSlug],
    affectsEntries: desiredSlug !== before.slug,
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

  // Link transfer, slug-history transfer, child re-homing, the soft delete, and
  // the audit event all happen in one transaction. Half a merge, with links
  // moved but the old slug still resolving, or a soft-deleted tag with no audit
  // trail, is not a state this system should be able to reach.
  const merged = await prisma.$transaction(async (tx) => {
    const [fromTag, intoTag] = await Promise.all([
      tx.tag.findFirst({
        where: { id: input.fromTagId, deletedAt: null },
        select: tagSelect,
      }),
      tx.tag.findFirst({
        where: { id: input.intoTagId, deletedAt: null },
        select: tagSelect,
      }),
    ]);

    if (!fromTag) throw new Error('From tag not found');
    if (!intoTag) throw new Error('Into tag not found');

    const fromSlugs = await tx.tagSlugHistory.findMany({
      where: { tagId: fromTag.id },
      select: { slug: true },
    });

    const entryLinks = await tx.entryTag.findMany({
      where: { tagId: fromTag.id },
      select: { entryId: true, assignedBy: true },
    });

    if (entryLinks.length) {
      await tx.entryTag.createMany({
        data: entryLinks.map((r) => ({
          entryId: r.entryId,
          tagId: intoTag.id,
          assignedBy: r.assignedBy,
        })),
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

    await tx.tag.updateMany({
      where: { parentId: fromTag.id },
      data: { parentId: intoTag.id },
    });

    const deleted = await tx.tag.update({
      where: { id: fromTag.id },
      data: { deletedAt: new Date() },
      select: { id: true, deletedAt: true },
    });

    const result = {
      movedEntryCount: entryLinks.length,
      slugsTransferred: slugsToTransfer.length,
      deleted,
    };

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'TAG_MERGE',
        entityType: 'TAG',
        entityId: fromTag.id,
        before: toJsonSafe({ fromTag, intoTag }),
        after: toJsonSafe({ intoTagId: intoTag.id, ...result }),
      },
    });

    return { fromSlug: fromTag.slug, intoSlug: intoTag.slug, ...result };
  });

  revalidateTagEntity({
    slugs: [merged.fromSlug, merged.intoSlug],
    affectsEntries: merged.movedEntryCount > 0,
  });
}
