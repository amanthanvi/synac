import { getPrismaClient, listPublishedEntriesForExport } from '@synac/db';

import {
  publicGet,
  readEntryType,
  readPagination,
  type PublicRouteResult,
} from '../../_shared/publicRoute';
import { entryPath, LICENSE, sensePath } from '../../_shared/serialize';

export { OPTIONS } from '../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

const COLUMNS = [
  'entry_id',
  'entry_type',
  'entry_slug',
  'entry_title',
  'entry_url',
  'summary_text',
  'published_at',
  'updated_at',
  'tags',
  'sense_id',
  'sense_slug',
  'sense_label',
  'sense_url',
  'sense_definition_text',
  'citation_source_name',
  'citation_source_slug',
  'citation_url',
  'citation_content_mode',
  'citation_is_primary',
  'citation_accessed_at',
  'citation_license_type',
  'citation_license_url',
  'citation_license_statement',
  'citation_attribution',
  'editorial_license',
] as const;

/**
 * Quote every field unconditionally and neutralise leading `=`, `+`, `-`, `@`.
 *
 * A definition is free text from an external source; without the prefix guard a
 * spreadsheet would happily evaluate one as a formula.
 */
type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function csvRow(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(',');
}

/**
 * `GET /api/v1/export/entries.csv?page=&pageSize=&type=`
 *
 * One row per (sense, citation) pair, so every exported definition travels with
 * the source and licence that permit its reuse. Entries with no published sense
 * still emit one row, so the export is a complete census.
 */
export const GET = publicGet(
  'api.v1.export.entries_csv',
  { scope: 'api_v1_export', limit: 30, windowSeconds: 60 },
  async (request): Promise<PublicRouteResult> => {
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

    const lines: string[] = [COLUMNS.join(',')];

    for (const entry of items) {
      const entryCells = [
        entry.id,
        entry.entryType,
        entry.primarySlug,
        entry.displayTitle,
        entryPath(entry.entryType, entry.primarySlug),
        entry.summaryText ?? '',
        entry.publishedAt?.toISOString() ?? '',
        entry.updatedAt.toISOString(),
        entry.tags.map((tag) => tag.slug).join('|'),
      ];

      if (entry.senses.length === 0) {
        lines.push(
          csvRow([
            ...entryCells,
            ...Array(COLUMNS.length - entryCells.length - 1).fill(''),
            LICENSE.editorial.name,
          ]),
        );
        continue;
      }

      for (const sense of entry.senses) {
        const senseCells = [
          sense.id,
          sense.slug ?? '',
          sense.senseLabel ?? '',
          sensePath(entry.entryType, entry.primarySlug, sense.slug),
          sense.definitionText ?? '',
        ];

        if (sense.definitions.length === 0) {
          lines.push(
            csvRow([
              ...entryCells,
              ...senseCells,
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              LICENSE.editorial.name,
            ]),
          );
          continue;
        }

        for (const attestation of sense.definitions) {
          const source = attestation.citation.source;
          lines.push(
            csvRow([
              ...entryCells,
              ...senseCells,
              source.name,
              source.sourceSlug,
              attestation.citation.url,
              attestation.contentMode,
              attestation.isPrimary ? 'true' : 'false',
              attestation.citation.accessedAt.toISOString(),
              source.licenseType,
              source.licenseUrl ?? '',
              source.licensePublicStatement ?? '',
              attestation.citation.attributionText ??
                source.attributionRequirements,
              LICENSE.editorial.name,
            ]),
          );
        }
      }
    }

    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return {
      kind: 'text',
      body: `${lines.join('\n')}\n`,
      contentType: 'text/csv; charset=utf-8',
      headers: {
        'content-disposition': `inline; filename="synac-entries-page-${page}.csv"`,
        'x-synac-total': String(total),
        'x-synac-page': String(page),
        'x-synac-page-count': String(pageCount),
      },
    };
  },
);
