import { readBrowsePage, type EntryType } from '@/lib/convex';
import { entryPath } from '@/lib/publicEntryPage';

import {
  handleReadRequest,
  jsonResponse,
  parseLetter,
  parsePage,
  parsePageSize,
} from './_shared';

/** Convex clamps browse to these bounds; mirroring them keeps meta honest. */
const MAX_BROWSE_PAGE = 10;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function browseResponse(
  request: Request,
  entryType: EntryType,
  routeName: string,
): Promise<Response> {
  return handleReadRequest(request, routeName, async (url) => {
    const letter = parseLetter(url.searchParams.get('letter'));
    const page = parsePage(url.searchParams.get('page'), MAX_BROWSE_PAGE);
    const pageSize = parsePageSize(
      url.searchParams.get('pageSize'),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const browse = await readBrowsePage(
      entryType,
      letter,
      page,
      pageSize,
      'title',
      '',
      null,
    );

    return jsonResponse(request, {
      results: browse.entries.map((entry) => ({
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        summary: entry.summaryText,
        senseSummary: entry.senseSummary,
        tags: entry.tags.map((tag) => ({
          slug: tag.slug,
          name: tag.name,
          assignedBy: tag.assignedBy,
        })),
        updatedAt: new Date(entry.updatedAt).toISOString(),
        url: entryPath(entry.entryType, entry.slug),
      })),
      meta: {
        letter,
        page,
        pageSize,
        total: browse.totalMatches,
        hasMore: browse.hasMore,
      },
    });
  });
}
