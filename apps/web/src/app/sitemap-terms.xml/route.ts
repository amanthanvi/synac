import { NextResponse } from 'next/server';

import { api, getConvexClient } from '@/lib/convex';
import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';
import { collectEntrySitemapUrls } from '@/lib/sitemapEntries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const client = getConvexClient();

  const urls = await collectEntrySitemapUrls({
    siteUrl,
    entryType: 'TERM',
    fetchPage: async ({ cursor, expectedVersion }) =>
      await client.query(api.sitemap.entrySlugsPage, {
        entryType: 'TERM',
        paginationOpts: { numItems: 500, cursor },
        expectedVersion,
      }),
  });

  return new NextResponse(renderUrlSet(urls), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
