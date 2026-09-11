import { normalizeTitle, normalizeWhitespace } from '@synac/db';

import { buildExtractorVersion } from '../version.js';
import type {
  AdapterContext,
  IngestAdapter,
  JsonObject,
  ParseOutcome,
  ParsedEntry,
  ParsedRelationship,
} from './adapter.js';
import {
  fetchWithPolicy,
  resolveContentMode,
  upsertSourceDocument,
} from './adapter.js';
import {
  buildVariants,
  inferEntryTypeFromTitle,
  normalizeMaxItems,
} from './textHeuristics.js';

const ADAPTER_SLUG = 'niccs-cisa-glossary';
const ADAPTER_VERSION = 'niccs@2';

export function parseCsvRecords(input: string): string[][] {
  const csv = input.replace(/^\uFEFF/, '');

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i] ?? '';

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((v) => v.length > 0)) records.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  if (row.some((v) => v.length > 0)) records.push(row);

  return records;
}

function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function findHeaderIndex(headers: string[], names: string[]): number {
  const wanted = new Set(names.map(normalizeHeaderKey));
  for (let i = 0; i < headers.length; i += 1) {
    if (wanted.has(normalizeHeaderKey(headers[i] ?? ''))) return i;
  }
  return -1;
}

function splitList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[,;]+/g)
    .map((v) => normalizeWhitespace(v))
    .filter(Boolean);
}

type NiccsRow = {
  term: string;
  acronymExpansion: string;
  definition: string;
  extendedDefinition: string;
  relatedTerms: string;
  synonyms: string;
  /** Upstream publication the definition was taken from; becomes the sense label. */
  from: string;
};

function parseNiccsRows(csv: string): NiccsRow[] {
  const records = parseCsvRecords(csv);
  const header = records[0] ?? [];
  const rows = records.slice(1);

  const termIdx = findHeaderIndex(header, ['term']);
  const acronymIdx = findHeaderIndex(header, [
    'acronym expansion',
    'acronymexpansion',
  ]);
  const defIdx = findHeaderIndex(header, ['definition']);
  const extIdx = findHeaderIndex(header, [
    'extended definition',
    'extendeddefinition',
  ]);
  const relIdx = findHeaderIndex(header, [
    'related term(s)',
    'related terms',
    'relatedterms',
  ]);
  const synIdx = findHeaderIndex(header, ['synonym(s)', 'synonyms']);
  const fromIdx = findHeaderIndex(header, ['from']);

  const missing = [
    { name: 'Term', idx: termIdx },
    { name: 'Acronym Expansion', idx: acronymIdx },
    { name: 'Definition', idx: defIdx },
    { name: 'Extended Definition', idx: extIdx },
    { name: 'Related Term(s)', idx: relIdx },
    { name: 'Synonym(s)', idx: synIdx },
    { name: 'From', idx: fromIdx },
  ].filter((c) => c.idx < 0);

  if (missing.length) {
    throw new Error(
      `NICCS CSV missing columns: ${missing.map((c) => c.name).join(', ')}`,
    );
  }

  return rows.map((r) => ({
    term: normalizeWhitespace(r[termIdx] ?? ''),
    acronymExpansion: normalizeWhitespace(r[acronymIdx] ?? ''),
    definition: normalizeWhitespace(r[defIdx] ?? ''),
    extendedDefinition: normalizeWhitespace(r[extIdx] ?? ''),
    relatedTerms: normalizeWhitespace(r[relIdx] ?? ''),
    synonyms: normalizeWhitespace(r[synIdx] ?? ''),
    from: normalizeWhitespace(r[fromIdx] ?? ''),
  }));
}

/**
 * The NICCS "From" column names the upstream authority the definition was
 * lifted from (for example "NIST SP 800-160 Vol. 2 Rev. 1"). That provenance is
 * what distinguishes one meaning from another, so it becomes the sense label.
 */
function parseNiccsSenseLabel(from: string): string | null {
  const text = normalizeWhitespace(from);
  if (!text || text.length > 200) return null;
  return text;
}

function buildRelatedTermRelationships(
  relatedTerms: string,
  term: string,
): ParsedRelationship[] {
  const normalizedTerm = normalizeTitle(term);
  const out: ParsedRelationship[] = [];
  const seen = new Set<string>();

  for (const related of splitList(relatedTerms)) {
    const key = normalizeTitle(related);
    if (!key || key === normalizedTerm || seen.has(key)) continue;
    seen.add(key);
    out.push({ type: 'RELATED', targetTitle: related });
  }

  return out;
}

async function parse(ctx: AdapterContext): Promise<ParseOutcome> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const exportUrl = new URL('/rest/vocab/export-csv', origin).toString();
  const maxItems = normalizeMaxItems(ctx.maxItems);
  const fetchedAt = new Date();

  const contentMode = resolveContentMode({
    defaultContentMode: ctx.source.defaultContentMode,
    verbatimOnly: true,
  });
  const extractorVersion = buildExtractorVersion(ADAPTER_VERSION);

  const fetched = await fetchWithPolicy({
    url: exportUrl,
    source: ctx.source,
    allowedHosts,
    allowedContentTypePrefixes: ['text/csv'],
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 20_000,
  });

  if (!fetched.ok) {
    return { entries: [], skipped: 1, failed: 0 };
  }

  const res = fetched.response;
  if (res.status !== 200) {
    throw new Error(
      `NICCS glossary export fetch failed (${res.status}) for ${exportUrl}`,
    );
  }

  const document = await upsertSourceDocument(ctx.prisma, {
    sourceId: ctx.source.id,
    url: exportUrl,
    canonicalUrl: res.url,
    title: 'NICCS glossary export (CSV)',
    contentType: res.contentType,
    etag: res.etag,
    lastModified: res.lastModified,
    fetchedAt,
    contentSha256: res.sha256,
    snapshotAllowed: false,
  });

  const parsedRows = parseNiccsRows(res.body.toString('utf8')).filter((r) =>
    Boolean(r.term),
  );

  const entries: ParsedEntry[] = [];
  let failed = 0;

  for (let i = 0; i < parsedRows.length && entries.length < maxItems; i += 1) {
    const row = parsedRows[i];
    if (!row) continue;

    const definitionMd = (() => {
      if (row.definition && row.extendedDefinition) {
        return `${row.definition}\n\n${row.extendedDefinition}`;
      }
      return row.definition || row.extendedDefinition || '';
    })();

    if (!definitionMd.trim()) {
      failed += 1;
      continue;
    }

    const normalizedTitle = normalizeTitle(row.term);
    const expandedForm = row.acronymExpansion.trim()
      ? row.acronymExpansion.trim()
      : null;
    const entryType = inferEntryTypeFromTitle(row.term, {
      acronymExpansion: row.acronymExpansion,
    });
    const synonyms = splitList(row.synonyms);
    const variants = buildVariants(synonyms, normalizedTitle);
    const relationships = buildRelatedTermRelationships(
      row.relatedTerms,
      row.term,
    );
    const sourceLocator = { row: i + 2, term: row.term };

    const extracted: JsonObject = {
      term: row.term,
      acronymExpansion: row.acronymExpansion,
      definition: row.definition,
      extendedDefinition: row.extendedDefinition,
      relatedTerms: splitList(row.relatedTerms),
      synonyms,
      from: row.from,
      fetchedAt: fetchedAt.toISOString(),
      url: exportUrl,
      canonicalUrl: res.url,
      contentType: res.contentType,
      sha256: res.sha256,
      sourceLocator,
    };
    if (res.etag) extracted.etag = res.etag;
    if (res.lastModified) extracted.lastModified = res.lastModified;

    const parsed: ParsedEntry = {
      itemKey: `term:${normalizedTitle}`,
      sourceDocumentId: document.id,
      fetchedAt,
      entryType,
      displayTitle: row.term,
      normalizedTitle,
      summaryMd: row.definition || row.extendedDefinition || definitionMd,
      senses: [
        {
          senseLabel: parseNiccsSenseLabel(row.from),
          expandedForm,
          definitionMd,
          sourceLocator,
        },
      ],
      contentMode,
      // A CSV export endpoint, not HTML scraping.
      extractionMethod: 'API',
      extractorVersion,
      confidenceScore: 0.8,
      extracted,
    };
    if (variants.length) parsed.variants = variants;
    if (relationships.length) parsed.relationships = relationships;

    entries.push(parsed);
  }

  return { entries, skipped: 0, failed };
}

export const niccsGlossaryAdapter: IngestAdapter = {
  slug: ADAPTER_SLUG,
  version: ADAPTER_VERSION,
  parse,
};
