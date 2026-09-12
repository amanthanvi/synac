const SEARCH_STOPWORDS = ['a', 'an', 'and', 'or', 'the'] as const;
export const MAX_QUERY_LENGTH = 120;
export const MAX_SEARCH_PAGE = 10;
export const SEARCH_PAGE_SIZE = 20;

export type SearchScope = 'entries' | 'senses';

export function normalizeSearchQuery(value: string): string {
  return value
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Queries the Convex index refuses: one character, or a bare stopword. Mirrors
 * `normalizeQuery` in convex/search.ts so the UI explains the empty result
 * instead of rendering "no matches" for a query that was never run.
 */
export function isIgnoredSearchQuery(value: string): boolean {
  const normalized = normalizeSearchQuery(value);
  if (normalized.length <= 1) return true;
  return SEARCH_STOPWORDS.some((stopword) => stopword === normalized);
}

export function parseSearchPage(value: string | null | undefined): number {
  const parsed = Math.floor(Number(value ?? 1));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(MAX_SEARCH_PAGE, parsed));
}

export function parseEntryTypeParam(
  value: string | null | undefined,
): 'TERM' | 'ACRONYM' | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'TERM') return 'TERM';
  if (normalized === 'ACRONYM') return 'ACRONYM';
  return null;
}

export function parseSearchScope(
  value: string | null | undefined,
): SearchScope {
  return value?.trim().toLowerCase() === 'senses' ? 'senses' : 'entries';
}
