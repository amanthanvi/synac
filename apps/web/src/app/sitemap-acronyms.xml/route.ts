import { NextResponse } from 'next/server';

import { api, getConvexClient, type FunctionReturnType } from '@/lib/convex';
import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const client = getConvexClient();

  const urls: Array<{ loc: string; lastmod: Date }> = [];
  let cursor: string | null = null;
  do {
    const page: FunctionReturnType<typeof api.sitemap.entrySlugsPage> = await client.query(api.sitemap.entrySlugsPage, {
      entryType: 'ACRONYM',
      paginationOpts: { numItems: 500, cursor },
    });
    for (const entry of page.page) {
      urls.push({ loc: `${siteUrl}/acronym/${entry.slug}`, lastmod: new Date(entry.updatedAt) });
    }
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);

  return new NextResponse(renderUrlSet(urls), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
