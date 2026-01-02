import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const prisma = getPrismaClient();

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { sourceSlug: true, updatedAt: true },
    orderBy: [{ sourceSlug: 'asc' }],
  });

  const xml = renderUrlSet(
    sources.map((s) => ({
      loc: `${siteUrl}/sources/${s.sourceSlug}`,
      lastmod: s.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

