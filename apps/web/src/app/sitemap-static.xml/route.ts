import { NextResponse } from 'next/server';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Indexable, hand-maintained routes only.
 *
 * `/search` and the sign-in/sign-up routes are deliberately absent: they are
 * disallowed in robots.txt and carry `robots: { index: false }`.
 */
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

  const xml = renderUrlSet(PATHS.map((path) => ({ loc: `${siteUrl}${path}` })));

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
