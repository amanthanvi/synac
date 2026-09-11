import {
  countSearchResults,
  getPrismaClient,
  getSearchIndexCoverage,
  searchPublishedEntries,
  searchPublishedSenses,
} from '@synac/db';

import { getRequestId } from '@/lib/apiErrors';
import { logger } from '@/lib/logger';
import {
  logSearchIndexCoverage,
  shouldAuditSearchIndexCoverage,
} from '@/lib/observability';

import {
  json,
  problem,
  publicGet,
  readEntryType,
} from '../_shared/publicRoute';
import { entryPath, LICENSE, pageMeta, sensePath } from '../_shared/serialize';

export { OPTIONS } from '../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/**
 * Kick off a background index-coverage audit for a search that looks wrong
 * (a long query returning nothing, or a slow one). Deliberately fire-and-forget:
 * diagnostics must never delay or fail a user's search.
 */
function maybeAuditIndexCoverage(input: {
  query: string;
  page: number;
  durationMs: number;
  resultsCount: number;
  requestId: string | undefined;
}): void {
  if (!shouldAuditSearchIndexCoverage(input)) return;

  const prisma = getPrismaClient();
  const requestId = input.requestId;

  setImmediate(() => {
    void (async () => {
      try {
        const coverage = await getSearchIndexCoverage(prisma, { limit: 10 });
        if (
          coverage.missingEntryIds.length > 0 ||
          coverage.orphanedEntryIds.length > 0
        ) {
          logSearchIndexCoverage({
            location: 'api_v1_search',
            publishedEntries: coverage.publishedEntries,
            indexedEntries: coverage.indexedEntries,
            missingEntryIds: coverage.missingEntryIds,
            orphanedEntryIds: coverage.orphanedEntryIds,
          });
        }
      } catch (error) {
        logger.warn('api.search.index_coverage_audit_failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}

/**
 * `GET /api/v1/search?q=&type=&tag=&page=&scope=entries|senses`
 *
 * `scope=senses` searches meanings rather than headwords, so a query that
 * matches one sense of a polysemous term links straight to that sense's
 * fragment instead of the top of the entry.
 *
 * Ranking internals (`score`, `bucket`) are deliberately not part of the
 * response: they are tuning knobs, and publishing them would freeze them.
 */
export const GET = publicGet(
  'api.v1.search',
  { scope: 'api_v1_search', limit: 60, windowSeconds: 60 },
  async (request) => {
    const startMs = Date.now();
    const requestId = getRequestId(request);

    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    // An unrecognised `type` filters nothing rather than 400ing a search box.
    const entryType = readEntryType(url) ?? undefined;
    const tagRaw = url.searchParams.get('tag')?.trim();
    const tag = tagRaw ? tagRaw.toLowerCase() : undefined;
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const scopeRaw =
      url.searchParams.get('scope')?.trim().toLowerCase() ?? 'entries';

    if (scopeRaw !== 'entries' && scopeRaw !== 'senses') {
      return problem(
        400,
        'invalid_scope',
        "scope must be 'entries' or 'senses'",
      );
    }

    if (!q.trim()) {
      return json({
        results: [],
        scope: scopeRaw,
        // `total` is mirrored at the top level as well as inside `meta`: it is
        // the one field callers reach for constantly, and several clients read
        // it directly.
        total: 0,
        meta: pageMeta({ page, pageSize: PAGE_SIZE, total: 0 }),
        license: LICENSE,
      });
    }

    const prisma = getPrismaClient();

    if (scopeRaw === 'senses') {
      const senseInput: Parameters<typeof searchPublishedSenses>[1] = {
        query: q,
        page,
        pageSize: PAGE_SIZE,
      };
      if (entryType) senseInput.entryType = entryType;

      const { items, total } = await searchPublishedSenses(prisma, senseInput);

      logger.info('api.search.ok', {
        requestId,
        scope: 'senses',
        durationMs: Date.now() - startMs,
        qLen: q.trim().length,
        page,
        resultsCount: items.length,
      });

      return json({
        scope: 'senses',
        total,
        results: items.map((item) => ({
          senseId: item.senseId,
          entryId: item.entryId,
          entryType: item.entryType,
          entryTitle: item.entryTitle,
          entrySlug: item.entrySlug,
          senseSlug: item.senseSlug,
          senseLabel: item.senseLabel,
          expandedForm: item.expandedForm,
          snippet: item.snippet,
          sourceNames: item.sourceNames,
          // `searchPublishedSenses` builds the `#s-<slug>` URL itself; fall back
          // to the shared helper if a row somehow arrives without one.
          url:
            item.url ||
            sensePath(item.entryType, item.entrySlug, item.senseSlug),
          citationRecordUrl: `/api/v1/senses/${item.senseId}/citation.json`,
        })),
        meta: pageMeta({ page, pageSize: PAGE_SIZE, total }),
        license: LICENSE,
      });
    }

    const searchInput: Parameters<typeof searchPublishedEntries>[1] = {
      query: q,
      page,
      pageSize: PAGE_SIZE,
    };
    if (entryType) searchInput.entryType = entryType;
    if (tag) searchInput.tagSlug = tag;

    const [results, total] = await Promise.all([
      searchPublishedEntries(prisma, searchInput),
      countSearchResults(prisma, searchInput),
    ]);

    maybeAuditIndexCoverage({
      query: q,
      page,
      durationMs: Date.now() - startMs,
      resultsCount: results.length,
      requestId,
    });

    logger.info('api.search.ok', {
      requestId,
      scope: 'entries',
      durationMs: Date.now() - startMs,
      qLen: q.trim().length,
      entryType,
      tag,
      page,
      resultsCount: results.length,
    });

    return json({
      scope: 'entries',
      total,
      results: results.map((r) => ({
        id: r.id,
        entryType: r.entryType,
        displayTitle: r.displayTitle,
        primarySlug: r.primarySlug,
        summaryText: r.summaryText,
        snippet: r.snippet,
        senseCount: r.senseCount,
        senseSummary: r.senseSummary,
        url: entryPath(r.entryType, r.primarySlug),
      })),
      meta: pageMeta({ page, pageSize: PAGE_SIZE, total }),
      license: LICENSE,
    });
  },
);
