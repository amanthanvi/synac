import type { DbClientLike } from '../client.js';
import type { EntryType, Prisma } from '@prisma/client';

const entryListSelect = {
  id: true,
  entryType: true,
  displayTitle: true,
  primarySlug: true,
  summaryText: true,
  updatedAt: true,
  publishedAt: true,
} satisfies Prisma.EntrySelect;

export type EntryListItem = Prisma.EntryGetPayload<{
  select: typeof entryListSelect;
}>;

export type ResolvedEntry = {
  entry: EntryListItem;
  canonicalSlug: string;
  needsRedirect: boolean;
};

export async function resolvePublishedEntryBySlug(
  db: DbClientLike,
  input: { entryType: EntryType; slug: string },
): Promise<ResolvedEntry | null> {
  const slug = input.slug.trim().toLowerCase();

  const canonicalEntry = await db.entry.findFirst({
    where: {
      entryType: input.entryType,
      primarySlug: slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: entryListSelect,
  });

  if (canonicalEntry) {
    return {
      entry: canonicalEntry,
      canonicalSlug: canonicalEntry.primarySlug,
      needsRedirect: false,
    };
  }

  const history = await db.entrySlugHistory.findFirst({
    where: { entryType: input.entryType, slug },
  });

  if (!history) return null;

  const entry = await db.entry.findFirst({
    where: { id: history.entryId, status: 'PUBLISHED', deletedAt: null },
    select: entryListSelect,
  });

  if (!entry) return null;

  return {
    entry,
    canonicalSlug: entry.primarySlug,
    needsRedirect: slug !== entry.primarySlug,
  };
}

export async function listRecentPublishedEntries(
  db: DbClientLike,
  input: { page: number; pageSize: number },
): Promise<EntryListItem[]> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));

  return db.entry.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    select: entryListSelect,
    orderBy: [{ updatedAt: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}
