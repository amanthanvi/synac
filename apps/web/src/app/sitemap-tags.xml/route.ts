import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { getSiteUrl, renderUrlSet } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();
  const prisma = getPrismaClient();

  const tags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: { slug: true, updatedAt: true },
    orderBy: [{ slug: 'asc' }],
  });

  const xml = renderUrlSet(
    tags.map((t) => ({
      loc: `${siteUrl}/tags/${t.slug}`,
      lastmod: t.updatedAt,
    })),
  );

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

