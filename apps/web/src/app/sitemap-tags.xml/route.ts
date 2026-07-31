import { NextResponse } from 'next/server';

import { api, getConvexClient } from '@/lib/convex';
import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const tags = await getConvexClient().query(api.sitemap.tagSlugs, {});

  const xml = renderUrlSet(tags.map((tag) => ({ loc: `${siteUrl}/tags/${tag.slug}` })));

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
