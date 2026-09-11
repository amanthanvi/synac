import { NextResponse } from 'next/server';

import { getSitemapTags } from '@/lib/publicData';
import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  // Only tags with at least one published entry, because an empty tag page is
  // a soft 404 as far as a crawler is concerned.
  const tags = await getSitemapTags();

  const xml = renderUrlSet(
    tags.map((tag) => ({
      loc: `${siteUrl}/tags/${tag.slug}`,
      lastmod: tag.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
