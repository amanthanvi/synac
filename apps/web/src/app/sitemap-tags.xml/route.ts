import { NextResponse } from 'next/server';

import { queryPublicConvex } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  const siteUrl = getSiteUrl();
  const tags = await queryPublicConvex<Array<{ slug: string; updatedAt: Date }>>('listSitemapTags');

  const xml = renderUrlSet(
    tags.map((t) => ({
      loc: `${siteUrl}/tags/${t.slug}`,
      lastmod: t.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
