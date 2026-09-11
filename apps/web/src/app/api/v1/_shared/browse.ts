/** Shared handler for `/terms` and `/acronyms`, which differ only by entry type. */
import { getPrismaClient, listPublishedEntries } from '@synac/db';

import {
  json,
  problem,
  readPagination,
  type EntryTypeValue,
  type PublicRouteResult,
} from './publicRoute';
import { pageMeta, serializeEntryListItem, LICENSE } from './serialize';

export async function browseEntries(
  request: Request,
  entryType: EntryTypeValue,
): Promise<PublicRouteResult> {
  const url = new URL(request.url);
  const { page, pageSize } = readPagination(url);

  const letterParam = url.searchParams.get('letter')?.trim().toLowerCase();
  // `0` is the documented spelling of the digit bucket; `0-9` is the internal one.
  const letterRaw = letterParam === '0' ? '0-9' : letterParam;
  const sortRaw = url.searchParams.get('sort')?.trim().toLowerCase();
  const tagSlug = url.searchParams.get('tag')?.trim().toLowerCase();
  const query = url.searchParams.get('q')?.trim();

  if (letterRaw && !/^[a-z]$/.test(letterRaw) && letterRaw !== '0-9') {
    return problem(
      400,
      'invalid_letter',
      "letter must be a single a-z character or '0-9'",
    );
  }

  if (sortRaw && sortRaw !== 'title' && sortRaw !== 'updated') {
    return problem(400, 'invalid_sort', "sort must be 'title' or 'updated'");
  }

  const listInput: Parameters<typeof listPublishedEntries>[1] = {
    entryType,
    sort: sortRaw === 'updated' ? 'updated' : 'title',
    page,
    pageSize,
  };
  if (letterRaw) listInput.letter = letterRaw;
  if (tagSlug) listInput.tagSlug = tagSlug;
  if (query) listInput.query = query;

  const { items, total } = await listPublishedEntries(
    getPrismaClient(),
    listInput,
  );

  return json({
    items: items.map(serializeEntryListItem),
    meta: pageMeta({ page, pageSize, total }),
    license: LICENSE,
  });
}
