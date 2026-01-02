import type { DbClientLike } from '../client.js';
import type { EntryType, Prisma } from '@prisma/client';

export type TagListItem = Prisma.TagGetPayload<{
  select: { id: true; name: true; slug: true; description: true; updatedAt: true };
}>;

export type ResolvedTag = {
  tag: TagListItem;
  canonicalSlug: string;
  needsRedirect: boolean;
};

export async function resolveTagBySlug(
  db: DbClientLike,
  input: { slug: string },
): Promise<ResolvedTag | null> {
  const slug = input.slug.trim().toLowerCase();

  const canonicalTag = await db.tag.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
  });

  if (canonicalTag) {
    return { tag: canonicalTag, canonicalSlug: canonicalTag.slug, needsRedirect: false };
  }

  const history = await db.tagSlugHistory.findFirst({ where: { slug } });
  if (!history) return null;

  const tag = await db.tag.findFirst({
    where: { id: history.tagId, deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
  });

  if (!tag) return null;

  return { tag, canonicalSlug: tag.slug, needsRedirect: slug !== tag.slug };
}

export async function listTags(db: DbClientLike): Promise<TagListItem[]> {
  return db.tag.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
    orderBy: [{ name: 'asc' }],
  });
}

export async function listPublishedEntriesForTag(
  db: DbClientLike,
  input: { tagId: string; entryType?: EntryType; page: number; pageSize: number },
): Promise<
  Array<
    Prisma.EntryGetPayload<{
      select: {
        id: true;
        entryType: true;
        displayTitle: true;
        primarySlug: true;
        summaryText: true;
        updatedAt: true;
        publishedAt: true;
      };
    }>
  >
> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  const entryTypeFilter = input.entryType ? { entryType: input.entryType } : {};

  const rows = await db.entryTag.findMany({
    where: {
      tagId: input.tagId,
      entry: { status: 'PUBLISHED', deletedAt: null, ...entryTypeFilter },
    },
    select: {
      entry: {
        select: {
          id: true,
          entryType: true,
          displayTitle: true,
          primarySlug: true,
          summaryText: true,
          updatedAt: true,
          publishedAt: true,
        },
      },
    },
    orderBy: [{ entry: { normalizedTitle: 'asc' } }],
    skip: offset,
    take: pageSize,
  });

  return rows.map((r) => r.entry);
}
