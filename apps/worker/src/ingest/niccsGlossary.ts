import type { Prisma, PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

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

type NiccsRow = {
  term: string;
  acronymExpansion: string;
  definition: string;
  extendedDefinition: string;
  relatedTerms: string;
  synonyms: string;
  from: string;
};

function parseNiccsRows(csv: string): NiccsRow[] {
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

export async function ingestNiccsGlossary(
  prisma: PrismaClient,
  input: {
    ingestRunId: string;
    source: { id: string; baseUrl: string; licenseType: string; lastVerifiedAt: Date | null };
    maxItems: number;
    forceReprocess: boolean;
  },
): Promise<{ itemsCreated: number }> {
  const base = new URL(input.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const exportUrl = new URL('/rest/vocab/export-csv', origin).toString();

  const maxItems = normalizeMaxItems(input.maxItems);

  const fetchedAt = new Date();
  const res = await safeFetch({
    url: exportUrl,
    allowedHosts,
    allowedContentTypePrefixes: ['text/csv'],
    maxRedirects: 3,
    timeoutMs: 20_000,
    maxBytes: 5 * 1024 * 1024,
    headers: {
      'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
    },
  });

  if (res.status !== 200) {
    throw new Error(`NICCS glossary export fetch failed (${res.status}) for ${exportUrl}`);
  }

  let sourceDocumentId: string;
  let sourceDocumentCreated = false;
  const sourceDocumentTitle = 'NICCS glossary export (CSV)';
  try {
    const created = await prisma.sourceDocument.create({
      data: {
        sourceId: input.source.id,
        url: exportUrl,
        canonicalUrl: res.url,
        title: sourceDocumentTitle,
        contentType: res.contentType,
        etag: res.etag,
        lastModified: res.lastModified,
        fetchedAt,
        contentSha256: res.sha256,
        snapshotAllowed: false,
        snapshotStorageUri: null,
      },
      select: { id: true },
    });
    sourceDocumentId = created.id;
    sourceDocumentCreated = true;
  } catch (err) {
    const existing = await prisma.sourceDocument.findFirst({
      where: { sourceId: input.source.id, url: exportUrl, contentSha256: res.sha256 },
      select: { id: true },
    });
    if (!existing) throw err;
    sourceDocumentId = existing.id;
  }

  const { licenseGate, licenseGateReason } = evaluateLicenseGate({
    licenseType: input.source.licenseType,
    lastVerifiedAt: input.source.lastVerifiedAt,
  });

  const csv = res.body.toString('utf8');
  const parsedRows = parseNiccsRows(csv).filter((r) => Boolean(r.term));

  let itemsCreated = 0;
  const seenItemKeys = new Set<string>();

  for (let i = 0; i < Math.min(parsedRows.length, maxItems); i += 1) {
    const row = parsedRows[i]!;
    const itemKey = `term:${normalizeTitle(row.term)}`;
    if (seenItemKeys.has(itemKey)) continue;
    seenItemKeys.add(itemKey);

    const expandedForm = row.acronymExpansion?.trim() ? row.acronymExpansion.trim() : null;
    const entryType = inferEntryTypeFromTitle(row.term, { acronymExpansion: row.acronymExpansion });
    const normalizedTitle = normalizeTitle(row.term);

    const definitionMd = (() => {
      if (row.definition && row.extendedDefinition) return `${row.definition}\n\n${row.extendedDefinition}`;
      return row.definition || row.extendedDefinition || '';
    })();

    if (!definitionMd.trim()) {
      continue;
    }

    const synonyms = splitList(row.synonyms);
    const variants = (() => {
      const out: Array<{ variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' }> = [];
      const seen = new Set<string>();

      for (const s of synonyms) {
        const text = s.trim();
        if (!text) continue;
        if (normalizeTitle(text) === normalizedTitle) continue;
        const key = normalizeTitle(text);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ variantText: text, variantType: inferVariantType(text) });
      }

      return out;
    })();

    if (!sourceDocumentCreated && !input.forceReprocess) {
      const prior = await prisma.ingestItem.findFirst({
        where: { sourceDocumentId, itemKey, stage: { not: 'FAILED' } },
        select: { id: true },
      });
      if (prior) continue;
    }

    const extracted = {
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
      ...(res.etag ? { etag: res.etag } : {}),
      ...(res.lastModified ? { lastModified: res.lastModified } : {}),
      sha256: res.sha256,
      sourceLocator: { row: i + 2, term: row.term },
    } satisfies Prisma.InputJsonObject;

    const createEntryProposedChange = {
      kind: 'CREATE_ENTRY',
      entryType,
      displayTitle: row.term,
      summaryMd: row.definition || row.extendedDefinition || definitionMd,
      ...(variants.length ? { variants } : {}),
      senses: [
        {
          ...(expandedForm ? { expandedForm } : {}),
          definitionMd,
          contentMode: 'QUOTED',
          extractionMethod: 'API',
          extractorVersion: 'synac-worker/0.0.0',
          sourceLocator: { row: i + 2, term: row.term },
        },
      ],
    };

    const stageOutputs: Record<string, Prisma.InputJsonValue> = { extracted };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey,
        stage: 'EXTRACTED',
        stageOutputs,
        confidenceScore: 0.8,
        licenseGate,
        licenseGateReason,
      },
      select: { id: true },
    });

    stageOutputs.normalized = { proposedChange: createEntryProposedChange };
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'NORMALIZED',
        proposedChange: createEntryProposedChange as Prisma.InputJsonValue,
        stageOutputs,
      },
      select: { id: true },
    });

    const existingEntry = await prisma.entry.findFirst({
      where: { entryType, normalizedTitle, deletedAt: null },
      select: { id: true, displayTitle: true },
    });

    const proposedChange = existingEntry
      ? {
          kind: 'ADD_SENSES',
          entryId: existingEntry.id,
          entryType,
          displayTitle: existingEntry.displayTitle,
          ...(variants.length ? { variants } : {}),
          senses: createEntryProposedChange.senses,
        }
      : createEntryProposedChange;

    stageOutputs.deduped = existingEntry
      ? { matchedEntryId: existingEntry.id, matchType: 'NORMALIZED_TITLE_EXACT', action: 'ADD_SENSES' }
      : { action: 'CREATE_ENTRY' };

    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'DEDUPED',
        proposedChange: proposedChange as Prisma.InputJsonValue,
        stageOutputs,
      },
      select: { id: true },
    });

    stageOutputs.enriched = {};
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'ENRICHED',
        stageOutputs,
      },
      select: { id: true },
    });

    stageOutputs.validated = { ok: true };
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'VALIDATED',
        error: null,
        stageOutputs,
      },
      select: { id: true },
    });

    itemsCreated += 1;
  }

  return { itemsCreated };
}

