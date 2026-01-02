import { NextResponse } from 'next/server';

import { getSiteUrl, renderSitemapIndex } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const xml = renderSitemapIndex([
    { loc: `${siteUrl}/sitemap-static.xml`, lastmod: now },
    { loc: `${siteUrl}/sitemap-terms.xml`, lastmod: now },
    { loc: `${siteUrl}/sitemap-acronyms.xml`, lastmod: now },
    { loc: `${siteUrl}/sitemap-tags.xml`, lastmod: now },
    { loc: `${siteUrl}/sitemap-sources.xml`, lastmod: now },
  ]);

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

