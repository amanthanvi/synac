import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReturnType } from 'convex/server';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { api } from '../../../../convex/_generated/api';
import { collectEntrySlugs, type EntrySlugRecord } from './sitemapEntries';

export type EntryType = 'TERM' | 'ACRONYM';
export type BrowseSort = 'title' | 'updated';

type EntryPagePayload = NonNullable<
  FunctionReturnType<typeof api.publicEntries.getEntryPage>
>;

export type PublicEntry = EntryPagePayload['entry'];
export type PublicEntrySense = PublicEntry['senses'][number];
export type PublicSenseCitation = PublicEntrySense['citations'][number];
export type PublicSenseAttestation = PublicEntrySense['attestations'][number];
export type PublicEntryRelation = EntryPagePayload['relationships'][number];
export type EntrySummary = FunctionReturnType<
  typeof api.publicEntries.listRecent
>['entries'][number];
export type PublicSource = NonNullable<
  FunctionReturnType<typeof api.sources.bySlug>
>;

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL (or CONVEX_URL) is not configured');
  }
  client = new ConvexHttpClient(url);
  return client;
}

/**
 * Auth for the anonymous runtime mutations (rate limits): the key is held only
 * by this server, so those endpoints cannot be driven from the open internet.
 */
function getServiceKey(): string {
  const key = process.env.SYNAC_CONVEX_SERVICE_KEY;
  if (!key) throw new Error('SYNAC_CONVEX_SERVICE_KEY is not configured');
  return key;
}

const CONTENT_TAG = 'content';
const CONTENT_TTL_SECONDS = 3600;

/**
 * Every content read goes through the Next data cache. The root layout reads
 * headers() for the CSP nonce, so rendering is always dynamic and the data
 * cache is the only caching layer; a content deploy drops it by calling
 * POST /api/v1/internal/revalidate with the `content` tag.
 */
function cached<Args extends unknown[], Result>(
  name: string,
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args: Args) =>
    unstable_cache(() => run(...args), [name, JSON.stringify(args)], {
      tags: [CONTENT_TAG],
      revalidate: CONTENT_TTL_SECONDS,
    })();
}

export const readResolvedSlug = cache(
  cached('publicEntries.resolveBySlug', (entryType: EntryType, slug: string) =>
    getClient().query(api.publicEntries.resolveBySlug, { entryType, slug }),
  ),
);

export const readEntryPage = cache(
  cached('publicEntries.getEntryPage', (entryType: EntryType, slug: string) =>
    getClient().query(api.publicEntries.getEntryPage, {
      entryType,
      slug,
      relationshipLimit: 50,
    }),
  ),
);

export const readRecentEntries = cache(
  cached('publicEntries.listRecent', (page: number, pageSize: number) =>
    getClient().query(api.publicEntries.listRecent, { page, pageSize }),
  ),
);

export const readBrowsePage = cache(
  cached(
    'publicBrowse.browse',
    (
      entryType: EntryType,
      letter: string,
      page: number,
      pageSize: number,
      sort: BrowseSort,
      query: string,
      tagSlug: string | null,
    ) =>
      getClient().query(api.publicBrowse.browse, {
        entryType,
        letter,
        page,
        pageSize,
        sort,
        query,
        tagSlug,
      }),
  ),
);

export const readEntrySearch = cache(
  cached(
    'search.search',
    (
      query: string,
      entryType: EntryType | null,
      tagSlug: string | null,
      page: number,
      pageSize: number,
    ) =>
      getClient().query(api.search.search, {
        query,
        entryType,
        tagSlug,
        page,
        pageSize,
      }),
  ),
);

export const readSenseSearch = cache(
  cached(
    'search.senses',
    (
      query: string,
      entryType: EntryType | null,
      page: number,
      pageSize: number,
    ) =>
      getClient().query(api.search.senses, {
        query,
        entryType,
        page,
        pageSize,
      }),
  ),
);

export const readTagDirectory = cache(
  cached('tags.directory', () => getClient().query(api.tags.directory, {})),
);

export const readTagResolution = cache(
  cached('tags.resolveSlug', (slug: string) =>
    getClient().query(api.tags.resolveSlug, { slug }),
  ),
);

export const readTag = cache(
  cached('tags.bySlug', (slug: string) =>
    getClient().query(api.tags.bySlug, { slug }),
  ),
);

export const readTagEntries = cache(
  cached(
    'tags.entriesForTag',
    (
      tagSlug: string,
      entryType: EntryType | null,
      page: number,
      pageSize: number,
    ) =>
      getClient().query(api.tags.entriesForTag, {
        tagSlug,
        entryType,
        page,
        pageSize,
      }),
  ),
);

export const readSources = cache(
  cached('sources.list', () => getClient().query(api.sources.list, {})),
);

export const readSource = cache(
  cached('sources.bySlug', (slug: string) =>
    getClient().query(api.sources.bySlug, { slug }),
  ),
);

export const readSourceCitedEntries = cache(
  cached(
    'sources.citedEntries',
    (sourceSlug: string, page: number, pageSize: number) =>
      getClient().query(api.sources.citedEntries, {
        sourceSlug,
        page,
        pageSize,
      }),
  ),
);

export const readTagSlugs = cache(
  cached('sitemap.tagSlugs', () => getClient().query(api.sitemap.tagSlugs, {})),
);

export const readSourceSlugs = cache(
  cached('sitemap.sourceSlugs', () =>
    getClient().query(api.sitemap.sourceSlugs, {}),
  ),
);

export const readEntrySlugs: (
  entryType: EntryType,
) => Promise<EntrySlugRecord[]> = cache(
  cached('sitemap.entrySlugs', (entryType: EntryType) =>
    collectEntrySlugs({
      entryType,
      fetchPage: ({ cursor, expectedVersion }) =>
        getClient().query(api.sitemap.entrySlugsPage, {
          entryType,
          paginationOpts: { numItems: 500, cursor },
          expectedVersion,
        }),
    }),
  ),
);

/** Rate limiting is a write, so it never touches the content cache. */
export async function consumeRateLimit(
  key: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return getClient().mutation(api.rateLimit.consume, {
    serviceKey: getServiceKey(),
    scope: 'api_v1_search',
    key,
  });
}
