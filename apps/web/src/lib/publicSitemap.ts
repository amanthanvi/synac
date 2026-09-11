import { NextResponse } from 'next/server';

import { getSitemapEntries, getSitemapEntryCount } from './publicData';
import {
  getSiteUrl,
  renderUrlSet,
  SITEMAP_PAGE_SIZE,
  sitemapPageCount,
} from './sitemap';

/**
 * One chunk of an entry sitemap.
 *
 * The sitemaps protocol caps a urlset at 50,000 URLs, so term and acronym
 * sitemaps are chunked at 45,000 and addressed as
 * `/sitemap-terms.xml?page=N` (page 1 is the bare URL). `/sitemap.xml` lists
 * every page, so a crawler never has to guess how many there are.
 */
export async function renderEntrySitemapPage(input: {
  entryType: 'TERM' | 'ACRONYM';
  pathPrefix: '/term' | '/acronym';
  page: string | null;
}): Promise<NextResponse> {
  const siteUrl = getSiteUrl();

  const total = await getSitemapEntryCount(input.entryType);
  const pageCount = sitemapPageCount(total);
  const requested = Math.floor(Number(input.page ?? 1));
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), pageCount)
    : 1;

  const entries = await getSitemapEntries({
    entryType: input.entryType,
    offset: (page - 1) * SITEMAP_PAGE_SIZE,
    limit: SITEMAP_PAGE_SIZE,
  });

  const xml = renderUrlSet(
    entries.map((entry) => ({
      loc: `${siteUrl}${input.pathPrefix}/${entry.primarySlug}`,
      lastmod: entry.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
