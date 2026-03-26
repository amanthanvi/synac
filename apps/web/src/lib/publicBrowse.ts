import { getPrismaClient } from '@synac/db';

export type BrowseType = 'TERM' | 'ACRONYM';
export type BrowseSort = 'title' | 'updated';

const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'.split(''), '0-9'] as const;

export function getBrowseLetters(): readonly string[] {
  return LETTERS;
}

export function normalizeBrowseLetter(value: string | undefined): string {
  const letter = (value ?? 'a').trim().toLowerCase();
  return LETTERS.includes(letter as (typeof LETTERS)[number]) ? letter : 'a';
}

export function buildBrowseHref(input: {
  basePath: '/terms' | '/acronyms';
  letter: string;
  page: number;
  sort: BrowseSort;
  query: string;
  tagSlug: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.letter !== 'a') params.set('letter', input.letter);
  if (input.page > 1) params.set('page', String(input.page));
  if (input.sort !== 'title') params.set('sort', input.sort);
  if (input.query.trim()) params.set('q', input.query.trim());
  if (input.tagSlug) params.set('tag', input.tagSlug);
  const queryString = params.toString();
  return queryString ? `${input.basePath}?${queryString}` : input.basePath;
}

export async function loadBrowsePageData(input: {
  entryType: BrowseType;
  letter: string;
  page: number;
  pageSize: number;
  sort: BrowseSort;
  query: string;
  rawTag: string;
}): Promise<{
  activeTag: { id: string; name: string; slug: string } | null;
  tags: Array<{ id: string; name: string; slug: string }>;
  entries: Array<{
    id: string;
    entryType: BrowseType;
    displayTitle: string;
    primarySlug: string;
    summaryText: string | null;
    updatedAt: Date;
    entryTags: Array<{ tag: { id: string; name: string; slug: string } }>;
  }>;
}> {
  const prisma = getPrismaClient();

  const activeTag = input.rawTag
    ? await prisma.tag.findFirst({
        where: { slug: input.rawTag, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const topTagAgg = await prisma.entryTag.groupBy({
    by: ['tagId'],
    where: {
      tag: { deletedAt: null },
      entry: { status: 'PUBLISHED', deletedAt: null, entryType: input.entryType },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: 'desc' } },
    take: 12,
  });

  const topTagIds = topTagAgg.map((row) => row.tagId);
  const topTags = topTagIds.length
    ? await prisma.tag.findMany({
        where: { id: { in: topTagIds }, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : [];

  const tagsById = new Map(topTags.map((tag) => [tag.id, tag] as const));
  const tags = topTagIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is (typeof topTags)[number] => Boolean(tag));
  if (activeTag && !tags.some((tag) => tag.id === activeTag.id)) {
    tags.unshift(activeTag);
  }

  const normalizedTitleFilter =
    input.letter === '0-9'
      ? {
          OR: Array.from({ length: 10 }, (_, number) => ({
            normalizedTitle: { startsWith: String(number) },
          })),
        }
      : { normalizedTitle: { startsWith: input.letter } };

  const queryFilter = input.query
    ? {
        OR: [
          { normalizedTitle: { contains: input.query.toLowerCase() } },
          { displayTitle: { contains: input.query, mode: 'insensitive' as const } },
          { summaryText: { contains: input.query, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const entries = await prisma.entry.findMany({
    where: {
      entryType: input.entryType,
      status: 'PUBLISHED',
      deletedAt: null,
      ...normalizedTitleFilter,
      ...(activeTag ? { entryTags: { some: { tagId: activeTag.id } } } : {}),
      ...queryFilter,
    },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      entryTags: {
        where: { tag: { deletedAt: null } },
        select: { tag: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ tag: { name: 'asc' } }],
      },
    },
    orderBy:
      input.sort === 'updated'
        ? [{ updatedAt: 'desc' }, { normalizedTitle: 'asc' }]
        : [{ normalizedTitle: 'asc' }],
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  });

  return { activeTag, tags, entries };
}
