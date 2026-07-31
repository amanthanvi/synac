import { slugify } from '@synac/content-tools';

import { safeFetch } from '../net/safeFetch.js';
import { finalizeBundle, type AdapterContext, type DraftEntry } from '../bundle.js';
import type { BundleFile } from '@synac/content-tools';

export const ADAPTER_VERSION = 'niccs-glossary/1.0.0';
const DOCUMENT_KEY = 'niccs-glossary-csv';
const USER_AGENT = 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeTitle(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function inferEntryTypeFromTitle(value: string, input: { acronymExpansion?: string }): 'TERM' | 'ACRONYM' {
  const v = value.trim();
  if (!v) return 'TERM';

  if (input.acronymExpansion?.trim()) {
    return v.includes(' ') ? 'TERM' : 'ACRONYM';
  }

  if (v.includes(' ')) return 'TERM';
  if (v.length < 2 || v.length > 24) return 'TERM';

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return 'TERM';

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  if (uppercase >= 2 && lowercase <= 2) return 'ACRONYM';
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0) return 'ACRONYM';

  return 'TERM';
}

function inferVariantType(value: string): 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' {
  const v = value.trim();
  if (!v) return 'ALIAS';
  if (v.includes(' ')) return 'SYNONYM';

  const compact = v.replace(/[.\-_/]/g, '');
  const isAllCaps =
    compact.length >= 2 &&
    compact === compact.toUpperCase() &&
    /[A-Z]/.test(compact) &&
    /^[A-Z0-9]+$/.test(compact);
  if (isAllCaps && v.length <= 24) return 'ABBREVIATION';

  return 'ALIAS';
}

export function parseCsvRecords(input: string): string[][] {
  const csv = input.replace(/^\uFEFF/, '');

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i]!;

    if (inQuotes) {
      if (ch === '"') {
        const next = csv[i + 1];
        if (next === '"') {
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
      if (row.some((v) => v.length > 0)) {
        records.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  if (row.some((v) => v.length > 0)) {
    records.push(row);
  }

  return records;
}

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
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

export type NiccsRow = {
  term: string;
  acronymExpansion: string;
  definition: string;
  extendedDefinition: string;
  relatedTerms: string;
  synonyms: string;
  from: string;
};

export function parseNiccsRows(csv: string): NiccsRow[] {
  const records = parseCsvRecords(csv);
  const header = records[0] ?? [];
  const rows = records.slice(1);

  const termIdx = findHeaderIndex(header, ['term']);
  const acronymIdx = findHeaderIndex(header, ['acronym expansion', 'acronymexpansion']);
  const defIdx = findHeaderIndex(header, ['definition']);
  const extIdx = findHeaderIndex(header, ['extended definition', 'extendeddefinition']);
  const relIdx = findHeaderIndex(header, ['related term(s)', 'related terms', 'relatedterms']);
  const synIdx = findHeaderIndex(header, ['synonym(s)', 'synonyms']);
  const fromIdx = findHeaderIndex(header, ['from']);

  const required = [
    { name: 'Term', idx: termIdx },
    { name: 'Acronym Expansion', idx: acronymIdx },
    { name: 'Definition', idx: defIdx },
    { name: 'Extended Definition', idx: extIdx },
    { name: 'Related Term(s)', idx: relIdx },
    { name: 'Synonym(s)', idx: synIdx },
    { name: 'From', idx: fromIdx },
  ].filter((c) => c.idx < 0);

  if (required.length) {
    throw new Error(`NICCS CSV missing columns: ${required.map((c) => c.name).join(', ')}`);
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

/** Maps parsed NICCS rows onto bundle entries, deduplicating slug collisions. */
export function bundleEntriesFromRows(rows: NiccsRow[], maxItems: number): DraftEntry[] {
  const out: DraftEntry[] = [];
  const seenKeys = new Set<string>();
  const parsedRows = rows.filter((r) => Boolean(r.term));

  for (let i = 0; i < Math.min(parsedRows.length, maxItems); i += 1) {
    const row = parsedRows[i]!;

    const slug = slugify(row.term);
    if (!slug) continue;

    const expandedForm = row.acronymExpansion.trim() ? row.acronymExpansion.trim() : null;
    const entryType = inferEntryTypeFromTitle(row.term, { acronymExpansion: row.acronymExpansion });
    const normalizedTitle = normalizeTitle(row.term);

    const key = `${entryType}:${slug}`;
    if (seenKeys.has(key)) continue;

    const definitionMd = (() => {
      if (row.definition && row.extendedDefinition) return `${row.definition}\n\n${row.extendedDefinition}`;
      return row.definition || row.extendedDefinition || '';
    })();

    if (!definitionMd.trim()) continue;
    seenKeys.add(key);

    const synonyms = splitList(row.synonyms);
    const variants = (() => {
      const out: Array<{ variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' }> = [];
      const seen = new Set<string>();

      for (const s of synonyms) {
        const text = s.trim();
        if (!text) continue;
        if (normalizeTitle(text) === normalizedTitle) continue;
        const variantKey = normalizeTitle(text);
        if (seen.has(variantKey)) continue;
        seen.add(variantKey);
        out.push({ variantText: text, variantType: inferVariantType(text) });
      }

      return out;
    })();

    out.push({
      entryType,
      slug,
      title: row.term,
      aliases: variants.map((variant) => variant.variantText),
      tags: [],
      summaryMd: row.definition || row.extendedDefinition || definitionMd,
      senses: [
        {
          key: slug,
          definitionMd,
          ...(expandedForm ? { expandedForm } : {}),
          examples: [],
          citation: {
            documentKey: DOCUMENT_KEY,
            citationText: `NICCS Cybersecurity Vocabulary, "${row.term}"`,
            locator: `row ${i + 2}`,
          },
        },
      ],
      relationships: [],
    });
  }

  return out;
}

export async function runNiccsGlossary(ctx: AdapterContext): Promise<BundleFile> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const exportUrl = new URL('/rest/vocab/export-csv', origin).toString();

  const res = await safeFetch({
    url: exportUrl,
    allowedHosts: [base.hostname],
    allowedContentTypePrefixes: ['text/csv'],
    maxRedirects: 3,
    timeoutMs: 20_000,
    maxBytes: 5 * 1024 * 1024,
    headers: {
      'user-agent': USER_AGENT,
    },
  });
  if (res.status !== 200) {
    throw new Error(`NICCS glossary export fetch failed (${res.status}) for ${exportUrl}`);
  }

  // Upstream unchanged: keep the previous bundle byte-identical.
  const previousDocument = ctx.previous?.documents.find((doc) => doc.key === DOCUMENT_KEY);
  if (ctx.previous && previousDocument?.contentSha256 === res.sha256) {
    return ctx.previous;
  }

  const rows = parseNiccsRows(res.body.toString('utf8'));

  return finalizeBundle({
    source: ctx.source,
    adapterVersion: ADAPTER_VERSION,
    documents: [
      {
        key: DOCUMENT_KEY,
        url: exportUrl,
        title: 'NICCS glossary export (CSV)',
        contentType: res.contentType.split(';')[0]!.trim() || 'text/csv',
        contentSha256: res.sha256,
        fetchedAt: ctx.now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
    ],
    entries: bundleEntriesFromRows(rows, ctx.maxItems),
    previous: ctx.previous,
    now: ctx.now,
  });
}
