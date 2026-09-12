import type { BrowseSort } from './convex';

export type BrowseBasePath = '/terms' | '/acronyms';

export const BROWSE_LETTERS: readonly string[] = [
  ...'abcdefghijklmnopqrstuvwxyz',
  '0-9',
];

/** convex/publicBrowse.ts clamps the page to 10; asking past it silently
    re-serves page 10, so the UI must not offer a page the backend will not serve. */
const BROWSE_PAGE_MAX = 10;

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
