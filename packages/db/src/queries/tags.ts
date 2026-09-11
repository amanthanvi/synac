import type { DbClientLike } from '../client.js';
import type { EntryListItem } from './entries.js';
import type { EntryType, Prisma, TagAssignment } from '@prisma/client';

const TAG_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  kind: true,
  parentId: true,
  updatedAt: true,
} satisfies Prisma.TagSelect;

export type TagListItem = Prisma.TagGetPayload<{ select: typeof TAG_SELECT }>;

/**
 * A tag plus its published-entry counts, split by how the link was assigned so
 * the UI can distinguish curated tagging from machine tagging.
 */
export type TagWithCounts = TagListItem & {
  entryCount: number;
  editorialEntryCount: number;
  autoEntryCount: number;
  ingestEntryCount: number;
};

export type TagTreeNode = TagWithCounts & {
  children: TagTreeNode[];
};

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
    select: TAG_SELECT,
  });

  if (canonicalTag) {
    return {
      tag: canonicalTag,
      canonicalSlug: canonicalTag.slug,
      needsRedirect: false,
    };
  }

  const history = await db.tagSlugHistory.findFirst({ where: { slug } });
  if (!history) return null;

  const tag = await db.tag.findFirst({
    where: { id: history.tagId, deletedAt: null },
    select: TAG_SELECT,
  });

  if (!tag) return null;

  return { tag, canonicalSlug: tag.slug, needsRedirect: slug !== tag.slug };
}

export async function listTags(db: DbClientLike): Promise<TagWithCounts[]> {
  const [tags, counts] = await Promise.all([
    db.tag.findMany({
      where: { deletedAt: null },
      select: TAG_SELECT,
      orderBy: [{ name: 'asc' }],
    }),
    db.entryTag.groupBy({
      by: ['tagId', 'assignedBy'],
      where: {
        tag: { deletedAt: null },
        entry: { status: 'PUBLISHED', deletedAt: null },
      },
      _count: { _all: true },
    }),
  ]);

  const byTagId = new Map<
    string,
    { EDITORIAL: number; AUTO: number; INGEST: number }
  >();
  for (const row of counts) {
    const bucket = byTagId.get(row.tagId) ?? {
      EDITORIAL: 0,
      AUTO: 0,
      INGEST: 0,
    };
    bucket[row.assignedBy] += row._count._all;
    byTagId.set(row.tagId, bucket);
  }

  return tags.map((tag) => {
    const bucket = byTagId.get(tag.id) ?? { EDITORIAL: 0, AUTO: 0, INGEST: 0 };
    return {
      ...tag,
      entryCount: bucket.EDITORIAL + bucket.AUTO + bucket.INGEST,
      editorialEntryCount: bucket.EDITORIAL,
      autoEntryCount: bucket.AUTO,
      ingestEntryCount: bucket.INGEST,
    };
  });
}

/**
 * The active tag catalog as a hierarchy. Tags whose parent is missing or
 * soft-deleted are surfaced at the root so nothing disappears from the UI.
 */
export async function listTagTree(db: DbClientLike): Promise<TagTreeNode[]> {
  const tags = await listTags(db);

  const nodes = new Map<string, TagTreeNode>();
  for (const tag of tags) {
    nodes.set(tag.id, { ...tag, children: [] });
  }

  const roots: TagTreeNode[] = [];
  for (const tag of tags) {
    const node = nodes.get(tag.id);
    if (!node) continue;

    const parent = tag.parentId ? nodes.get(tag.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function publishedEntriesForTagWhere(input: {
  tagId: string;
  entryType?: EntryType;
  assignedBy?: TagAssignment;
}): Prisma.EntryTagWhereInput {
  const entry: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
  };
  if (input.entryType) entry.entryType = input.entryType;

  const where: Prisma.EntryTagWhereInput = {
    tagId: input.tagId,
    tag: { deletedAt: null },
    entry,
  };
  if (input.assignedBy) where.assignedBy = input.assignedBy;

  return where;
}

export async function listPublishedEntriesForTag(
  db: DbClientLike,
  input: {
    tagId: string;
    entryType?: EntryType;
    assignedBy?: TagAssignment;
    page: number;
    pageSize: number;
  },
): Promise<EntryListItem[]> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));

  const rows = await db.entryTag.findMany({
    where: publishedEntriesForTagWhere(input),
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
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return rows.map((row) => row.entry);
}

export async function countPublishedEntriesForTag(
  db: DbClientLike,
  input: { tagId: string; entryType?: EntryType; assignedBy?: TagAssignment },
): Promise<number> {
  return db.entryTag.count({ where: publishedEntriesForTagWhere(input) });
}
