import { getPrismaClient, listPublishedEntriesForExport } from '@synac/db';

import {
  json,
  publicGet,
  readEntryType,
  readPagination,
} from '../../_shared/publicRoute';
import { LICENSE, pageMeta, serializeEntry } from '../../_shared/serialize';

export { OPTIONS } from '../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

/**
 * `GET /api/v1/export/entries.json?page=&pageSize=&type=`
 *
 * The full published dataset, per-sense citations included, paginated so a
 * single request can never pin the whole corpus in memory. `meta.nextPage` is
 * the cursor: keep following it until it is null.
 */
export const GET = publicGet(
  'api.v1.export.entries_json',
  { scope: 'api_v1_export', limit: 30, windowSeconds: 60 },
  async (request) => {
    const url = new URL(request.url);
    const { page, pageSize } = readPagination(url, {
      pageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    });

    // An unrecognised `type` is ignored rather than rejected: the export is a
    // bulk feed, and a 400 mid-crawl is worse than an unfiltered page.
    const entryType = readEntryType(url) ?? undefined;

    const exportInput: Parameters<typeof listPublishedEntriesForExport>[1] = {
      page,
      pageSize,
    };
    if (entryType) exportInput.entryType = entryType;

    const { items, total } = await listPublishedEntriesForExport(
      getPrismaClient(),
      exportInput,
    );

    const meta = pageMeta({ page, pageSize, total });

    return json({
      items: items.map(serializeEntry),
      meta: { ...meta, nextPage: page < meta.pageCount ? page + 1 : null },
      license: LICENSE,
    });
  },
);
