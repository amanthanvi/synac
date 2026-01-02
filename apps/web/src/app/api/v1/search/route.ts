import { NextResponse } from 'next/server';

import { getPrismaClient, searchPublishedEntries } from '@synac/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseEntryType(value: string | null): 'TERM' | 'ACRONYM' | undefined {
  const v = value?.toUpperCase();
  if (v === 'TERM') return 'TERM';
  if (v === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const q = url.searchParams.get('q') ?? '';
  const entryType = parseEntryType(url.searchParams.get('type'));
  const tag = url.searchParams.get('tag') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

  if (!q.trim()) {
    return NextResponse.json({
      results: [],
      meta: { page, pageSize: 20 },
    });
  }

  const prisma = getPrismaClient();
  const results = await searchPublishedEntries(prisma, {
    query: q,
    entryType,
    tagSlug: tag?.trim() ? tag.trim().toLowerCase() : undefined,
    page,
    pageSize: 20,
  });

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      entryType: r.entryType,
      displayTitle: r.displayTitle,
      primarySlug: r.primarySlug,
      summaryText: r.summaryText,
      snippet: r.snippet,
      url: r.entryType === 'TERM' ? `/term/${r.primarySlug}` : `/acronym/${r.primarySlug}`,
      score: r.score,
      bucket: r.bucket,
    })),
    meta: { page, pageSize: 20 },
  });
}
