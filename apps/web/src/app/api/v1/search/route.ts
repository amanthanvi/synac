import { NextResponse, type NextRequest } from 'next/server';

import {
  getPrismaClient,
  getSearchIndexCoverage,
  searchPublishedEntries,
} from '@synac/db';

import { logger } from '@/lib/logger';
import {
  shouldAuditSearchIndexCoverage,
  logSearchIndexCoverage,
} from '@/lib/observability';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseEntryType(value: string | null): 'TERM' | 'ACRONYM' | undefined {
  const v = value?.toUpperCase();
  if (v === 'TERM') return 'TERM';
  if (v === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const normalizedQuery = q.toLowerCase().replace(/\s+/g, ' ').trim();
    const page = Math.max(1, Math.min(10, Number(url.searchParams.get('page') ?? 1) || 1));

    if (!q || q.length > 120) {
      return NextResponse.json({
        results: [],
        meta: { page, pageSize: 20 },
      });
    }

    if (
      normalizedQuery.length <= 1 ||
      normalizedQuery === 'a' ||
      normalizedQuery === 'an' ||
      normalizedQuery === 'and' ||
      normalizedQuery === 'or' ||
      normalizedQuery === 'the'
    ) {
      return NextResponse.json({
        results: [],
        meta: { page, pageSize: 20 },
      });
    }

    const rate = await enforceRateLimit({ request, scope: 'api_v1_search', limit: 60, windowSeconds: 60 });
    if (!rate.allowed) {
      logger.warn('api.search.rate_limited', { requestId, retryAfterSeconds: rate.retryAfterSeconds });
      return NextResponse.json(
        { error: 'rate_limited', requestId, retryAfterSeconds: rate.retryAfterSeconds },
        { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
      );
    }

    const entryType = parseEntryType(url.searchParams.get('type'));
    const tag = url.searchParams.get('tag') ?? undefined;

    const prisma = getPrismaClient();
    const results = await searchPublishedEntries(prisma, {
      query: q,
      entryType,
      tagSlug: tag?.trim() ? tag.trim().toLowerCase() : undefined,
      page,
      pageSize: 20,
    });

    const durationAfterSearchMs = Date.now() - startMs;
    if (
      shouldAuditSearchIndexCoverage({
        query: q,
        page,
        durationMs: durationAfterSearchMs,
        resultsCount: results.length,
      })
    ) {
      const prismaClient = prisma;
      const rid = requestId;
      setImmediate(() => {
        void (async () => {
          try {
            const coverage = await getSearchIndexCoverage(prismaClient, { limit: 10 });
            if (coverage.missingEntryIds.length > 0 || coverage.orphanedEntryIds.length > 0) {
              logSearchIndexCoverage({
                location: 'api_v1_search',
                publishedEntries: coverage.publishedEntries,
                indexedEntries: coverage.indexedEntries,
                missingEntryIds: coverage.missingEntryIds,
                orphanedEntryIds: coverage.orphanedEntryIds,
              });
            }
          } catch (coverageErr) {
            const message = coverageErr instanceof Error ? coverageErr.message : String(coverageErr);
            logger.warn('api.search.index_coverage_audit_failed', { requestId: rid, error: message });
          }
        })();
      });
    }

    const totalDurationMs = Date.now() - startMs;

    logger.info('api.search.ok', {
      requestId,
      durationMs: totalDurationMs,
      qLen: q.trim().length,
      entryType,
      tag: tag?.trim() ? tag.trim().toLowerCase() : undefined,
      page,
      resultsCount: results.length,
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        entryType: r.entryType,
        displayTitle: r.displayTitle,
        primarySlug: r.primarySlug,
        summaryText: r.summaryText,
        snippet: r.snippet,
        senseCount: r.senseCount,
        senseSummary: r.senseSummary,
        url: r.entryType === 'TERM' ? `/term/${r.primarySlug}` : `/acronym/${r.primarySlug}`,
        score: r.score,
        bucket: r.bucket,
      })),
      meta: { page, pageSize: 20 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('api.search.error', { requestId, durationMs: Date.now() - startMs, error: message });
    return NextResponse.json({ error: 'internal_error', requestId }, { status: 500 });
  }
}
