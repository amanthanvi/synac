import { NextResponse } from 'next/server';

import { queryPublicConvex } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  const siteUrl = getSiteUrl();
  const entries = await queryPublicConvex<Array<{ primarySlug: string; updatedAt: Date }>>('listSitemapEntries', {
    entryType: 'TERM',
  });

  const xml = renderUrlSet(
    entries.map((e) => ({
      loc: `${siteUrl}/term/${e.primarySlug}`,
      lastmod: e.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
