import { readEntryPage, readEntrySlugs, type EntryType } from '@/lib/convex';

import {
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  parsePage,
  serializeEntry,
} from '../../_shared';

export const runtime = 'nodejs';

const EXPORT_PAGE_SIZE = 50;
const MAX_EXPORT_PAGE = 1000;

const LICENSE = {
  editorial: {
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    covers:
      'The editorial layer: entry structure, disambiguation, sense ordering, and tags.',
  },
  sourceText: {
    covers:
      'Quoted or attested text reproduced from a source stays under that source license.',
    note: 'Each citation carries licenseUrl and publicStatement identifying the license that governs its text.',
  },
} as const;

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'export.entries', async (url) => {
    // listRecent cannot serve the whole corpus, so the page is cut from the
    // sitemap slug lists: all terms first, then all acronyms.
    const [terms, acronyms] = await Promise.all([
      readEntrySlugs('TERM'),
      readEntrySlugs('ACRONYM'),
    ]);
    const corpus: Array<{ entryType: EntryType; slug: string }> = [
      ...terms.map((record) => ({ entryType: 'TERM' as const, ...record })),
      ...acronyms.map((record) => ({
        entryType: 'ACRONYM' as const,
        ...record,
      })),
    ];

    const total = corpus.length;
    const totalPages = Math.max(1, Math.ceil(total / EXPORT_PAGE_SIZE));
    const page = Math.min(
      parsePage(url.searchParams.get('page'), MAX_EXPORT_PAGE),
      totalPages,
    );
    const slice = corpus.slice(
      (page - 1) * EXPORT_PAGE_SIZE,
      page * EXPORT_PAGE_SIZE,
    );

    const pages = await Promise.all(
      slice.map((record) => readEntryPage(record.entryType, record.slug)),
    );

    return jsonResponse(request, {
      license: LICENSE,
      results: pages.flatMap((value) =>
        value ? [serializeEntry(value.entry)] : [],
      ),
      meta: {
        page,
        pageSize: EXPORT_PAGE_SIZE,
        total,
        hasMore: page < totalPages,
      },
    });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
