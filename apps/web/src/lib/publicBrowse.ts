import type { BrowseSort } from './convex';

export type BrowseBasePath = '/terms' | '/acronyms';

export const BROWSE_LETTERS: readonly string[] = [
  ...'abcdefghijklmnopqrstuvwxyz',
  '0-9',
];

/**
 * convex/publicBrowse.ts clamps the requested page to this value and re-serves
 * the last page. `hasMore` can still be true there when the letter has more
 * matches, so callers must not link past the cap. Keep this in sync with
 * `BROWSE_PAGE_MAX` in convex/publicBrowse.ts.
 */
export const BROWSE_PAGE_MAX = 10;

export function normalizeBrowseLetter(value: string | undefined): string {
  const letter = (value ?? 'a').trim().toLowerCase();
  return BROWSE_LETTERS.includes(letter) ? letter : 'a';
}

export function normalizeBrowseSort(value: string | undefined): BrowseSort {
  return value === 'updated' ? 'updated' : 'title';
}

export function normalizeBrowsePage(value: string | undefined): number {
  const parsed = Math.floor(Number(value ?? 1));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(BROWSE_PAGE_MAX, parsed));
}

export function normalizeBrowseTag(value: string | undefined): string | null {
  const slug = (value ?? '').trim().toLowerCase();
  return slug ? slug : null;
}

/** The only builder for browse URLs: query state is the browse state. */
export function buildBrowseHref(input: {
  basePath: BrowseBasePath;
  letter: string;
  page: number;
  sort: BrowseSort;
  query: string;
  tagSlug: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.letter !== 'a') params.set('letter', input.letter);
  if (input.page > 1) params.set('page', String(input.page));
  if (input.sort !== 'title') params.set('sort', input.sort);
  if (input.query.trim()) params.set('q', input.query.trim());
  if (input.tagSlug) params.set('tag', input.tagSlug);
  const queryString = params.toString();
  return queryString ? `${input.basePath}?${queryString}` : input.basePath;
}

/** Another page exists and the backend will serve it, rather than clamping. */
export function browseOffersNextPage(page: number, hasMore: boolean): boolean {
  return hasMore && page < BROWSE_PAGE_MAX;
}

/** More matches exist, but this page is the last one browse will serve. */
export function browseNeedsRefineHint(page: number, hasMore: boolean): boolean {
  return hasMore && page >= BROWSE_PAGE_MAX;
}

/** The only builder for the browse Next link. Undefined at the page cap. */
export function browseNextHref(input: {
  basePath: BrowseBasePath;
  letter: string;
  page: number;
  sort: BrowseSort;
  query: string;
  tagSlug: string | null;
  hasMore: boolean;
}): string | undefined {
  if (!browseOffersNextPage(input.page, input.hasMore)) return undefined;
  return buildBrowseHref({
    basePath: input.basePath,
    letter: input.letter,
    page: input.page + 1,
    sort: input.sort,
    query: input.query,
    tagSlug: input.tagSlug,
  });
}
