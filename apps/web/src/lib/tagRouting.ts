const MAX_TAG_PAGE = 100;

type TagEntryType = 'TERM' | 'ACRONYM';

export function parseTagEntryType(
  value: string | undefined,
): TagEntryType | undefined {
  const normalized = value?.toUpperCase();
  if (normalized === 'TERM') return 'TERM';
  if (normalized === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

export function parseTagPage(value: string | undefined): number {
  return Math.max(
    1,
    Math.min(MAX_TAG_PAGE, Math.floor(Number(value ?? 1) || 1)),
  );
}

/** The only builder for tag URLs: filters are validated, pagination is clamped. */
export function tagPagePath(
  slug: string,
  entryType: TagEntryType | undefined,
  page: number,
): string {
  const query = new URLSearchParams();
  if (entryType) query.set('type', entryType);
  if (page > 1) query.set('page', String(Math.min(MAX_TAG_PAGE, page)));
  return `/tags/${slug}${query.size > 0 ? `?${query.toString()}` : ''}`;
}

export function nextTagPagePath(
  slug: string,
  entryType: TagEntryType | undefined,
  page: number,
  hasMore: boolean,
): string | undefined {
  if (!hasMore || page >= MAX_TAG_PAGE) return undefined;
  return tagPagePath(slug, entryType, page + 1);
}
