import { NextResponse } from 'next/server';

import { getSiteUrl, renderSitemapIndex, SITEMAP_HEADERS } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const xml = renderSitemapIndex(
    ['static', 'terms', 'acronyms', 'tags', 'sources'].map((name) => ({
      loc: `${siteUrl}/sitemap-${name}.xml`,
      lastmod: now,
    })),
  );

  return new NextResponse(xml, { headers: SITEMAP_HEADERS });
}
