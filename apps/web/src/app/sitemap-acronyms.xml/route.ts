import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const prisma = getPrismaClient();

  const entries = await prisma.entry.findMany({
    where: { status: 'PUBLISHED', deletedAt: null, entryType: 'ACRONYM' },
    select: { primarySlug: true, updatedAt: true },
    orderBy: [{ normalizedTitle: 'asc' }],
  });

  const xml = renderUrlSet(
    entries.map((e) => ({
      loc: `${siteUrl}/acronym/${e.primarySlug}`,
      lastmod: e.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

