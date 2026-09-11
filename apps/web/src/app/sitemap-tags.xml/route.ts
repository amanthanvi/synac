import { NextResponse } from 'next/server';

import { readTagSlugs } from '@/lib/convex';
import { getSiteUrl, renderUrlSet, SITEMAP_HEADERS } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const tags = await readTagSlugs();

  const xml = renderUrlSet(
    tags.map((tag) => ({ loc: `${siteUrl}/tags/${tag.slug}` })),
  );

  return new NextResponse(xml, { headers: SITEMAP_HEADERS });
}
