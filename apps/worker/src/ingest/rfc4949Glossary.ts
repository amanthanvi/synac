import { normalizeTitle } from '@synac/db';

import { buildExtractorVersion } from '../version.js';
import type {
  AdapterContext,
  IngestAdapter,
  JsonObject,
  ParseOutcome,
  ParsedEntry,
  ParsedRelationship,
  VariantType,
} from './adapter.js';
import {
  fetchWithPolicy,
  resolveContentMode,
  upsertSourceDocument,
} from './adapter.js';
import {
  firstParagraph,
  inferEntryTypeFromTitle,
  inferVariantType,
  normalizeMaxItems,
} from './textHeuristics.js';

const ADAPTER_SLUG = 'ietf-rfc4949-glossary';
const ADAPTER_VERSION = 'rfc4949@2';

type DefinitionType = 'I' | 'N' | 'O' | 'D';

type ParsedRfcSense = {
  definitionType: DefinitionType;
  senseLabel: string | null;
  definitionMd: string;
  expandedForm: string | null;
};

type ParsedRfcEntry = {
  title: string;
  normalizedTitle: string;
  entryType: 'TERM' | 'ACRONYM';
  summaryMd: string;
  senses: ParsedRfcSense[];
  variants: Array<{ variantText: string; variantType: VariantType }>;
  /** `SEE_ALSO` targets harvested from the entry's `See:` lines. */
  seeAlso: string[];
  sourceLocator: { line: number; title: string };
};

const BASE_INDENT = '      ';

/** RFC 4949 is one large document, so a run reads more of it than the shared default. */
const MAX_ITEMS_FALLBACK = 200;

/** Single-token titles in this document run longer than the shared default cap. */
const MAX_ACRONYM_TITLE_LENGTH = 32;

function stripBaseIndent(value: string): string {
  if (value.startsWith(BASE_INDENT)) return value.slice(BASE_INDENT.length);
  return value.trimStart();
}

function isPageNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed === '\f' || trimmed === '') return true;
  if (trimmed.startsWith('RFC 4949')) return true;
  if (trimmed.startsWith('Shirey') && trimmed.includes('[Page')) return true;
  return false;
}

function normalizeDefinitionWhitespace(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line, idx, all) => {
      if (line.trim()) return true;
      const prev = all[idx - 1]?.trim();
      const next = all[idx + 1]?.trim();
      return Boolean(prev || next);
    });

  const out: string[] = [];
  let blankStreak = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blankStreak += 1;
      if (blankStreak <= 1) out.push('');
      continue;
    }
    blankStreak = 0;
    out.push(line);
  }

  return out.join('\n').trim();
}

function stripTrailingAbbreviation(title: string): {
  mainTitle: string;
  abbreviation: string | null;
} {
  const trimmed = title.trim();
  const match = trimmed.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  if (!match) return { mainTitle: trimmed, abbreviation: null };

  const main = (match[1] ?? '').trim();
  const abbr = (match[2] ?? '').trim();

  if (!main) return { mainTitle: trimmed, abbreviation: null };
  if (!abbr || abbr.includes(' ') || abbr.length > 32)
    return { mainTitle: trimmed, abbreviation: null };

  return { mainTitle: main, abbreviation: abbr };
}

function parseDefinitionType(value: string | undefined): DefinitionType | null {
  if (value === 'I' || value === 'N' || value === 'O' || value === 'D')
    return value;
  return null;
}

function parseDefinitionHeader(line: string): {
  indexLabel: string | null;
  definitionType: DefinitionType;
  context: string | null;
  rest: string;
} | null {
  const trimmed = stripBaseIndent(line);
  const match = trimmed.match(/^(?:(\d+[a-z]?)\.\s+)?\(([INOD])\)\s*(.*)$/);
  if (!match) return null;

  const indexLabel = match[1] ? match[1] : null;
  const definitionType = parseDefinitionType(match[2]);
  if (!definitionType) return null;
  const afterType = (match[3] ?? '').trim();

  const ctxMatch = afterType.match(/^\/([^/]+)\/\s*(.*)$/);
  const context = ctxMatch?.[1]?.trim() ?? null;
  const rest = (ctxMatch ? (ctxMatch[2] ?? '') : afterType).trim();

  return { indexLabel, definitionType, context: context || null, rest };
}

function buildSenseLabel(input: {
  indexLabel: string | null;
  definitionType: DefinitionType;
  context: string | null;
}): string {
  const parts: string[] = [];
  if (input.indexLabel) parts.push(input.indexLabel);
  parts.push(`(${input.definitionType})`);
  if (input.context) parts.push(`/${input.context}/`);
  return parts.join(' ');
}

function inferExpandedFormFromDefinition(input: {
  entryType: 'TERM' | 'ACRONYM';
  definitionMd: string;
}): string | null {
  if (input.entryType !== 'ACRONYM') return null;

  const text = input.definitionMd.trim();
  const seeMatch = text.match(/^See:\s*([^.\n]+)\./i);
  const synonymMatch = text.match(
    /^(?:Synonym|Abbreviation)\s+for\s+"([^"]+)"/i,
  );

  const candidate = (synonymMatch?.[1] ?? seeMatch?.[1] ?? '').trim();
  if (!candidate) return null;
  if (!candidate.includes(' ')) return null;
  if (/^(Deprecated|Tutorial|Usage)\b/i.test(candidate)) return null;
  if (candidate.length > 200) return null;

  return candidate;
}

const SEE_LIST_STOPWORDS =
  /^(?:deprecated|usage|tutorial|example|note|also|the|a|an)$/i;

/**
 * RFC 4949 cross-references read `See: cryptographic key, key management.` and
 * may wrap across lines. Only `See:` is harvested: `(C)` commentary about
 * confusable terms is prose, not a machine-readable field, so
 * `OFTEN_CONFUSED_WITH` cannot be derived reliably, and the document offers
 * nothing from which `BROADER_THAN`/`NARROWER_THAN` could be inferred.
 */
export function parseSeeAlsoTargets(definitionMd: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const matches = definitionMd.matchAll(
    /\bSee:\s*([\s\S]*?)(?:\.\s|\.$|\n\s*\n|$)/g,
  );

  for (const match of matches) {
    const list = match[1];
    if (!list || list.length > 300) continue;

    for (const rawCandidate of list.split(/,|\band\b/g)) {
      const candidate = rawCandidate
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—)]+/, '')
        .replace(/[.\s]+$/, '')
        .trim();

      if (!candidate || candidate.length > 120) continue;
      if (!/[A-Za-z]/.test(candidate)) continue;
      if (SEE_LIST_STOPWORDS.test(candidate)) continue;

      const key = normalizeTitle(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
      if (out.length >= 12) return out;
    }
  }

  return out;
}

export function parseRfc4949Entries(input: string): ParsedRfcEntry[] {
  const text = input.replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  const entries: Array<{ title: string; startLine: number; lines: string[] }> =
    [];
  let current: { title: string; startLine: number; lines: string[] } | null =
    null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const match = line.match(/^\s*\$\s+(.+?)\s*$/);
    if (match) {
      if (current) entries.push(current);
      current = { title: match[1]!.trim(), startLine: i + 1, lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);

  const parsed: ParsedRfcEntry[] = [];

  for (const entry of entries) {
    const { mainTitle, abbreviation } = stripTrailingAbbreviation(entry.title);
    const normalized = normalizeTitle(mainTitle);
    if (!normalized) continue;

    const variants: ParsedRfcEntry['variants'] = [];
    if (abbreviation && normalizeTitle(abbreviation) !== normalized) {
      variants.push({
        variantText: abbreviation,
        variantType: inferVariantType(abbreviation),
      });
    }

    const entryType = inferEntryTypeFromTitle(mainTitle, {
      maxLength: MAX_ACRONYM_TITLE_LENGTH,
    });

    const cleanedLines = entry.lines.filter((line) => !isPageNoiseLine(line));

    const senses: ParsedRfcSense[] = [];
    let currentHeader: ReturnType<typeof parseDefinitionHeader> | null = null;
    let currentLines: string[] = [];

    const flush = () => {
      if (!currentHeader) return;
      const definitionMd = normalizeDefinitionWhitespace(
        currentLines.join('\n'),
      );
      const expandedForm = inferExpandedFormFromDefinition({
        entryType,
        definitionMd,
      });
      senses.push({
        definitionType: currentHeader.definitionType,
        senseLabel: buildSenseLabel({
          indexLabel: currentHeader.indexLabel,
          definitionType: currentHeader.definitionType,
          context: currentHeader.context,
        }),
        definitionMd,
        expandedForm,
      });
    };

    for (const rawLine of cleanedLines) {
      const header = parseDefinitionHeader(rawLine);
      if (header) {
        flush();
        currentHeader = header;
        currentLines = [];
        if (header.rest) currentLines.push(header.rest);
        continue;
      }

      if (!currentHeader) continue;
      currentLines.push(stripBaseIndent(rawLine));
    }

    flush();
    if (senses.length === 0) continue;

    const summaryMd = firstParagraph(senses[0]!.definitionMd);
    if (!summaryMd.trim()) continue;

    const seenSeeAlso = new Set<string>();
    const seeAlso: string[] = [];
    for (const sense of senses) {
      for (const target of parseSeeAlsoTargets(sense.definitionMd)) {
        const key = normalizeTitle(target);
        if (!key || key === normalized || seenSeeAlso.has(key)) continue;
        seenSeeAlso.add(key);
        seeAlso.push(target);
      }
    }

    parsed.push({
      title: mainTitle,
      normalizedTitle: normalized,
      entryType,
      summaryMd,
      senses,
      variants,
      seeAlso,
      sourceLocator: { line: entry.startLine, title: mainTitle },
    });
  }

  return parsed;
}

async function parse(ctx: AdapterContext): Promise<ParseOutcome> {
  const url = new URL(ctx.source.baseUrl);
  const allowedHosts = [url.hostname];
  const maxItems = normalizeMaxItems(ctx.maxItems, MAX_ITEMS_FALLBACK);
  const fetchedAt = new Date();

  const contentMode = resolveContentMode({
    defaultContentMode: ctx.source.defaultContentMode,
    verbatimOnly: true,
  });
  const extractorVersion = buildExtractorVersion(ADAPTER_VERSION);

  const fetched = await fetchWithPolicy({
    url: url.toString(),
    source: ctx.source,
    allowedHosts,
    allowedContentTypePrefixes: ['text/plain'],
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 30_000,
  });

  if (!fetched.ok) {
    return { entries: [], skipped: 1, failed: 0 };
  }

  const res = fetched.response;
  if (res.status !== 200) {
    throw new Error(
      `RFC 4949 fetch failed (${res.status}) for ${url.toString()}`,
    );
  }

  const document = await upsertSourceDocument(ctx.prisma, {
    sourceId: ctx.source.id,
    url: url.toString(),
    canonicalUrl: res.url,
    title: 'RFC 4949 \u2014 Internet Security Glossary (Version 2)',
    contentType: res.contentType,
    etag: res.etag,
    lastModified: res.lastModified,
    fetchedAt,
    contentSha256: res.sha256,
    snapshotAllowed: false,
  });

  const parsedEntries = parseRfc4949Entries(res.body.toString('utf8'));

  const entries: ParsedEntry[] = [];
  let failed = 0;

  for (const entry of parsedEntries) {
    if (entries.length >= maxItems) break;

    const senses = entry.senses.filter((s) => Boolean(s.definitionMd.trim()));
    if (senses.length === 0) {
      failed += 1;
      continue;
    }

    const relationships: ParsedRelationship[] = entry.seeAlso.map(
      (targetTitle) => ({
        type: 'SEE_ALSO',
        targetTitle,
      }),
    );

    const extracted: JsonObject = {
      title: entry.title,
      senseCount: senses.length,
      seeAlso: entry.seeAlso,
      fetchedAt: fetchedAt.toISOString(),
      url: url.toString(),
      canonicalUrl: res.url,
      contentType: res.contentType,
      sha256: res.sha256,
      sourceLocator: entry.sourceLocator,
    };
    if (res.etag) extracted.etag = res.etag;
    if (res.lastModified) extracted.lastModified = res.lastModified;

    const parsed: ParsedEntry = {
      itemKey: `term:${entry.normalizedTitle}`,
      sourceDocumentId: document.id,
      fetchedAt,
      entryType: entry.entryType,
      displayTitle: entry.title,
      normalizedTitle: entry.normalizedTitle,
      summaryMd: entry.summaryMd,
      senses: senses.map((s) => ({
        senseLabel: s.senseLabel,
        expandedForm: s.expandedForm,
        definitionMd: s.definitionMd,
        sourceLocator: { ...entry.sourceLocator, senseLabel: s.senseLabel },
      })),
      contentMode,
      // RFC 4949 is a plain-text RFC fetched whole; it is not HTML scraping.
      extractionMethod: 'API',
      extractorVersion,
      confidenceScore: 0.85,
      extracted,
    };
    if (entry.variants.length) parsed.variants = entry.variants;
    if (relationships.length) parsed.relationships = relationships;

    entries.push(parsed);
  }

  return { entries, skipped: 0, failed };
}

export const rfc4949GlossaryAdapter: IngestAdapter = {
  slug: ADAPTER_SLUG,
  version: ADAPTER_VERSION,
  parse,
};
