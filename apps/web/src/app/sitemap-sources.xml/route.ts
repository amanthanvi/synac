import { NextResponse } from 'next/server';

import { getSitemapSources } from '@/lib/publicData';
import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const sources = await getSitemapSources();

  const xml = renderUrlSet(
    sources.map((source) => ({
      loc: `${siteUrl}/sources/${source.sourceSlug}`,
      lastmod: source.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
