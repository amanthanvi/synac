import type { NextRequest } from 'next/server';

import { renderEntrySitemapPage } from '@/lib/publicSitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `?page=N` selects a 45,000-URL chunk; the index links every page. */
export async function GET(request: NextRequest) {
  return renderEntrySitemapPage({
    entryType: 'ACRONYM',
    pathPrefix: '/acronym',
    page: request.nextUrl.searchParams.get('page'),
  });
}
