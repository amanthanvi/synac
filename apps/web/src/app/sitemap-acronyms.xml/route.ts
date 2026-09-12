import { NextResponse } from 'next/server';

import { renderEntryUrlSet, SITEMAP_HEADERS } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(await renderEntryUrlSet('ACRONYM'), {
    headers: SITEMAP_HEADERS,
  });
}
