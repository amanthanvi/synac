import { queryPublicConvex } from '@synac/db';

export type BrowseType = 'TERM' | 'ACRONYM';
export type BrowseSort = 'title' | 'updated';

const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'.split(''), '0-9'] as const;

export function getBrowseLetters(): readonly string[] {
  return LETTERS;
}

export function normalizeBrowseLetter(value: string | undefined): string {
  const letter = (value ?? 'a').trim().toLowerCase();
  return LETTERS.includes(letter as (typeof LETTERS)[number]) ? letter : 'a';
}

export function buildBrowseHref(input: {
  basePath: '/terms' | '/acronyms';
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

export async function loadBrowsePageData(input: {
  entryType: BrowseType;
  letter: string;
  page: number;
  pageSize: number;
  sort: BrowseSort;
  query: string;
  rawTag: string;
}): Promise<{
  activeTag: { id: string; name: string; slug: string } | null;
  tags: Array<{ id: string; name: string; slug: string }>;
  entries: Array<{
    id: string;
    entryType: BrowseType;
    displayTitle: string;
    primarySlug: string;
    summaryText: string | null;
    updatedAt: Date;
    entryTags: Array<{ tag: { id: string; name: string; slug: string } }>;
  }>;
}> {
  return queryPublicConvex('loadBrowsePageData', input);
}
