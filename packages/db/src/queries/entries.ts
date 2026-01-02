import type { DbClientLike } from '../client.js';
import type { EntryType, Prisma } from '@prisma/client';

export type EntryListItem = Prisma.EntryGetPayload<{
  select: {
    id: true;
    entryType: true;
    displayTitle: true;
    primarySlug: true;
    summaryText: true;
    updatedAt: true;
    publishedAt: true;
  };
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
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      publishedAt: true,
    },
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
    where: {
      id: history.entryId,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      publishedAt: true,
    },
  });

  if (!entry) return null;

  return {
    entry,
    canonicalSlug: entry.primarySlug,
    needsRedirect: slug !== entry.primarySlug,
  };
}

export async function listPublishedEntriesByLetter(
  db: DbClientLike,
  input: {
    entryType: EntryType;
    letter: string;
    page: number;
    pageSize: number;
  },
): Promise<EntryListItem[]> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  const letter = input.letter.trim().toLowerCase();

  const normalizedTitleFilter =
    letter === '0-9'
      ? {
          OR: [
            { normalizedTitle: { startsWith: '0' } },
            { normalizedTitle: { startsWith: '1' } },
            { normalizedTitle: { startsWith: '2' } },
            { normalizedTitle: { startsWith: '3' } },
            { normalizedTitle: { startsWith: '4' } },
            { normalizedTitle: { startsWith: '5' } },
            { normalizedTitle: { startsWith: '6' } },
            { normalizedTitle: { startsWith: '7' } },
            { normalizedTitle: { startsWith: '8' } },
            { normalizedTitle: { startsWith: '9' } },
          ],
        }
      : { normalizedTitle: { startsWith: letter } };

  return db.entry.findMany({
    where: {
      entryType: input.entryType,
      status: 'PUBLISHED',
      deletedAt: null,
      ...normalizedTitleFilter,
    },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: [{ normalizedTitle: 'asc' }],
    skip: offset,
    take: pageSize,
  });
}

export async function listRecentPublishedEntries(
  db: DbClientLike,
  input: { page: number; pageSize: number },
): Promise<EntryListItem[]> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  return db.entry.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
    skip: offset,
    take: pageSize,
  });
}
