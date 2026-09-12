import { NextResponse } from 'next/server';

import { readSourceSlugs } from '@/lib/convex';
import { getSiteUrl, renderUrlSet, SITEMAP_HEADERS } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const sources = await readSourceSlugs();

  const xml = renderUrlSet(
    sources.map((source) => ({
      loc: `${siteUrl}/sources/${source.slug}`,
      lastmod: new Date(source.lastVerifiedAt),
    })),
  );

  return new NextResponse(xml, { headers: SITEMAP_HEADERS });
}
