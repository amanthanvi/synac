import { NextResponse } from 'next/server';

import { getSiteUrl, renderUrlSet, SITEMAP_HEADERS } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** /search is excluded: it is a query surface with nothing to index. */
const PATHS = [
  '/',
  '/terms',
  '/acronyms',
  '/tags',
  '/sources',
  '/recent',
  '/about',
  '/legal/privacy',
  '/legal/terms',
  '/changelog',
];

export async function GET() {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const xml = renderUrlSet(
    PATHS.map((path) => ({ loc: `${siteUrl}${path}`, lastmod: now })),
  );

  return new NextResponse(xml, { headers: SITEMAP_HEADERS });
}
