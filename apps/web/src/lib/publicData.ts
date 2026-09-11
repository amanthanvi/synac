import { unstable_cache } from 'next/cache';

import { publicReads, toJsonSafe, type JsonSafe } from '@synac/db';

import { CACHE_TAG, entryTag, sourceTag, tagTag } from './cacheTags';

/**
 * Cache contract for public reads.
 *
 * Every loader below is wrapped in `unstable_cache` with a 60s revalidate and
 * the tags listed next to it. Publish/archive/merge flows call `revalidateTag`
 * with exactly these names (see `./cacheTags`):
 *
 *   entry:<entryType>:<slug>, entries, tags, tag:<slug>, sources,
 *   source:<slug>, search
 */
const REVALIDATE_SECONDS = 60;

const TAGS = {
  entries: CACHE_TAG.entries,
  tags: CACHE_TAG.tags,
  sources: CACHE_TAG.sources,
  search: CACHE_TAG.search,
  entry: entryTag,
  tag: tagTag,
  source: sourceTag,
} as const;

/**
 * `unstable_cache` JSON round-trips its payload, so a cached `Date` comes back
 * as a string while a cache miss returns the real object. Normalising to ISO
 * strings up front makes the two paths identical.
 */
function cached<Result>(
  keyParts: string[],
  tags: string[],
  loader: () => Promise<Result>,
): () => Promise<JsonSafe<Result>> {
  return unstable_cache(async () => toJsonSafe(await loader()), keyParts, {
    tags,
    revalidate: REVALIDATE_SECONDS,
  });
}

export type EntryType = 'TERM' | 'ACRONYM';

export type EntryPageResult = JsonSafe<
  Awaited<ReturnType<typeof publicReads.entryPage>>
>;

export async function getEntryPage(
  entryType: EntryType,
  slug: string,
): Promise<EntryPageResult> {
  return cached(
    ['public-entry-page', entryType, slug],
    [TAGS.entry(entryType, slug), TAGS.entries],
    () => publicReads.entryPage({ entryType, slug }),
  )();
}

export async function getBrowseEntries(input: {
  entryType: EntryType;
  letter: string;
  page: number;
  pageSize: number;
  sort: 'title' | 'updated';
  query: string;
  tagSlug: string | null;
}) {
  return cached(
    [
      'public-browse',
      input.entryType,
      input.letter,
      String(input.page),
      String(input.pageSize),
      input.sort,
      input.query,
      input.tagSlug ?? '',
    ],
    [TAGS.entries, TAGS.tags],
    () => publicReads.browseEntries(input),
  )();
}

export async function getRecentEntries(input: {
  page: number;
  pageSize: number;
}) {
  return cached(
    ['public-recent', String(input.page), String(input.pageSize)],
    [TAGS.entries],
    () => publicReads.recentEntries(input),
  )();
}

export async function getTagDirectory() {
  return cached(['public-tag-directory'], [TAGS.tags, TAGS.entries], () =>
    publicReads.tagDirectory(),
  )();
}

export async function getTagBySlug(slug: string) {
  return cached(['public-tag', slug], [TAGS.tags, TAGS.tag(slug)], () =>
    publicReads.tagBySlug({ slug }),
  )();
}

export async function getTagEntries(input: {
  tagId: string;
  tagSlug: string;
  entryType?: EntryType;
  page: number;
  pageSize: number;
}) {
  return cached(
    [
      'public-tag-entries',
      input.tagSlug,
      input.entryType ?? 'ALL',
      String(input.page),
      String(input.pageSize),
    ],
    [TAGS.entries, TAGS.tag(input.tagSlug)],
    () =>
      publicReads.tagEntries({
        tagId: input.tagId,
        entryType: input.entryType,
        page: input.page,
        pageSize: input.pageSize,
      }),
  )();
}

export async function getSourceDirectory() {
  return cached(['public-sources'], [TAGS.sources], async () => {
    const sources = await publicReads.sources();
    const stats = await publicReads.sourceCitationStats({
      sourceIds: sources.map((source) => source.id),
    });
    return { sources, stats };
  })();
}

export async function getSourceBySlug(slug: string) {
  return cached(
    ['public-source', slug],
    [TAGS.sources, TAGS.source(slug)],
    () => publicReads.sourceBySlug({ slug }),
  )();
}

export async function getSourceCitedEntries(input: {
  sourceId: string;
  sourceSlug: string;
  page: number;
  pageSize: number;
}) {
  return cached(
    [
      'public-source-entries',
      input.sourceSlug,
      String(input.page),
      String(input.pageSize),
    ],
    [TAGS.sources, TAGS.source(input.sourceSlug), TAGS.entries],
    () =>
      publicReads.sourceCitedEntries({
        sourceId: input.sourceId,
        page: input.page,
        pageSize: input.pageSize,
      }),
  )();
}

export async function getSearchResults(input: {
  query: string;
  page: number;
  pageSize: number;
  entryType?: EntryType;
}) {
  return cached(
    [
      'public-search',
      input.query,
      String(input.page),
      String(input.pageSize),
      input.entryType ?? 'ALL',
    ],
    [TAGS.search, TAGS.entries],
    async () => {
      const totalInput: { query: string; entryType?: EntryType } = {
        query: input.query,
      };
      if (input.entryType) totalInput.entryType = input.entryType;

      const [items, total] = await Promise.all([
        publicReads.search(input),
        publicReads.searchTotal(totalInput),
      ]);

      return { items, total };
    },
  )();
}

/** "Did you mean ...?" plus related tags, for the search empty state. */
export async function getSearchFallbacks(input: {
  query: string;
  entryType?: EntryType;
}) {
  return cached(
    ['public-search-fallbacks', input.query, input.entryType ?? 'ALL'],
    [TAGS.search, TAGS.tags],
    async () => {
      const [suggestion, tags] = await Promise.all([
        publicReads.searchSuggestion(input),
        publicReads.tagsMatchingQuery({ query: input.query, limit: 6 }),
      ]);
      return { suggestion, tags };
    },
  )();
}

export async function getSitemapEntries(input: {
  entryType: EntryType;
  offset: number;
  limit: number;
}) {
  return cached(
    [
      'public-sitemap-entries',
      input.entryType,
      String(input.offset),
      String(input.limit),
    ],
    [TAGS.entries],
    () => publicReads.sitemapEntries(input),
  )();
}

export async function getSitemapEntryCount(entryType: EntryType) {
  return cached(['public-sitemap-entry-count', entryType], [TAGS.entries], () =>
    publicReads.sitemapEntryCount({ entryType }),
  )();
}

export async function getSitemapTags() {
  return cached(['public-sitemap-tags'], [TAGS.tags, TAGS.entries], () =>
    publicReads.sitemapTags(),
  )();
}

export async function getSitemapSources() {
  return cached(['public-sitemap-sources'], [TAGS.sources], () =>
    publicReads.sitemapSources(),
  )();
}

export async function getSitemapLastmodMap() {
  return cached(
    ['public-sitemap-lastmods'],
    [TAGS.entries, TAGS.tags, TAGS.sources],
    () => publicReads.sitemapLastmods(),
  )();
}
