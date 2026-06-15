import { NextResponse } from 'next/server';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const paths = [
    '/',
    '/terms',
    '/acronyms',
    '/tags',
    '/sources',
    '/search',
    '/recent',
    '/about',
    '/legal/privacy',
    '/legal/terms',
    '/changelog',
  ];

  const xml = renderUrlSet(
    paths.map((p) => ({
      loc: `${siteUrl}${p}`,
      lastmod: now,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
