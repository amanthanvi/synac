import { NextResponse } from 'next/server';

import { queryPublicConvex } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const sources = await queryPublicConvex<Array<{ sourceSlug: string; updatedAt: Date }>>('listSitemapSources');

  const xml = renderUrlSet(
    sources.map((s) => ({
      loc: `${siteUrl}/sources/${s.sourceSlug}`,
      lastmod: s.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
