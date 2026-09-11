import { readEntrySearch, readSenseSearch } from '@/lib/convex';
import {
  SEARCH_PAGE_SIZE,
  isIgnoredSearchQuery,
  normalizeSearchQuery,
  parseEntryTypeParam,
  parseSearchPage,
  parseSearchScope,
} from '@/lib/searchQuery';
import { entryPath } from '@/lib/publicEntryPage';

import {
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  parseSlug,
} from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'search', async (url) => {
    const query = normalizeSearchQuery(url.searchParams.get('q') ?? '');
    const scope = parseSearchScope(url.searchParams.get('scope'));
    const page = parseSearchPage(url.searchParams.get('page'));
    const entryType = parseEntryTypeParam(url.searchParams.get('type'));
    const tagSlug = parseSlug(url.searchParams.get('tag'));

    // A query the index would refuse is an empty result, not a client error.
    if (!query || isIgnoredSearchQuery(query)) {
      return jsonResponse(request, {
        results: [],
        meta: {
          page,
          pageSize: SEARCH_PAGE_SIZE,
          total: 0,
          hasMore: false,
          scope,
        },
      });
    }

    if (scope === 'senses') {
      const senses = await readSenseSearch(
        query,
        entryType,
        page,
        SEARCH_PAGE_SIZE,
      );
      return jsonResponse(request, {
        results: senses.results.map((result) => ({
          entryType: result.entryType,
          slug: result.slug,
          title: result.title,
          senseKey: result.senseKey,
          anchor: result.anchor,
          label: result.label,
          expandedForm: result.expandedForm,
          labelFallback: result.labelFallback,
          sourceNames: result.sourceNames,
          snippet: result.snippet,
          url: `${entryPath(result.entryType, result.slug)}#${result.anchor}`,
        })),
        meta: {
          page,
          pageSize: SEARCH_PAGE_SIZE,
          total: senses.total,
          hasMore: senses.hasMore,
          scope,
        },
      });
    }

    const entries = await readEntrySearch(
      query,
      entryType,
      tagSlug,
      page,
      SEARCH_PAGE_SIZE,
    );
    return jsonResponse(request, {
      results: entries.results.map((result) => ({
        id: result.key,
        entryType: result.entryType,
        displayTitle: result.title,
        primarySlug: result.slug,
        summaryText: result.summaryText,
        snippet: result.snippet,
        senseCount: result.senseCount,
        senseSummary: result.senseSummary,
        url: entryPath(result.entryType, result.slug),
      })),
      meta: {
        page,
        pageSize: SEARCH_PAGE_SIZE,
        total: entries.total,
        hasMore: entries.hasMore,
        scope,
      },
    });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
