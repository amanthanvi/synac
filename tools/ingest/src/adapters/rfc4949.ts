import { normalizeTitle, slugify } from '@synac/content-tools';

import { classifyEntryType, classifyVariantType } from '../classify.js';
import { safeFetch } from '../net/safeFetch.js';
import { conditionalHeaders, documentValidators } from '../net/conditional.js';
import {
  finalizeBundle,
  shortContentType,
  type AdapterContext,
  type DraftEntry,
} from '../bundle.js';
import type { BundleFile } from '@synac/content-tools';

export const ADAPTER_VERSION = 'rfc4949/1.1.0';
const DOCUMENT_KEY = 'rfc4949-txt';
const MAX_RELATIONSHIPS = 100;
const MAX_REFERENCE_LENGTH = 80;

type DefinitionType = 'I' | 'N' | 'O' | 'D';

type ParsedSense = {
  definitionType: DefinitionType;
  senseLabel: string | null;
  definitionMd: string;
  expandedForm: string | null;
};

export type ParsedEntry = {
  title: string;
  normalizedTitle: string;
  entryType: 'TERM' | 'ACRONYM';
  summaryMd: string;
  senses: ParsedSense[];
  variants: Array<{
    variantText: string;
    variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION';
  }>;
  sourceLocator: { line: number; title: string };
};

const BASE_INDENT = '      ';

/**
 * A top-level section header at column 0, e.g. "5. Security Considerations".
 * Glossary entries and their definitions are always indented, so an unindented
 * numbered header can only be the section that follows the glossary.
 */
const TOP_LEVEL_SECTION = /^\d+\.\s+\S/;

function stripBaseIndent(value: string): string {
  if (value.startsWith(BASE_INDENT)) return value.slice(BASE_INDENT.length);
  return value.trimStart();
}

function isPageNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed === '\f' || trimmed === '') return true;
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
  const definitionType = match[2] as DefinitionType;
  const afterType = (match[3] ?? '').trim();

  const ctxMatch = afterType.match(/^\/([^/]+)\/\s*(.*)$/);
  const context = ctxMatch ? ctxMatch[1]!.trim() : null;
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

export function parseRfc4949Entries(input: string): ParsedEntry[] {
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

    // The glossary is section 4 of RFC 4949. Once entries have begun, the next
    // top-level section header ends it, so sections 5+ and the reference list
    // never get appended to the last entry's definition.
    if (current && TOP_LEVEL_SECTION.test(line)) {
      entries.push(current);
      current = null;
      break;
    }

    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);

  const parsed: ParsedEntry[] = [];

  for (const entry of entries) {
    const { mainTitle, abbreviation } = stripTrailingAbbreviation(entry.title);
    const normalized = normalizeTitle(mainTitle);
    if (!normalized) continue;

    const variants = (() => {
      const out: Array<{
        variantText: string;
        variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION';
      }> = [];
      const seen = new Set<string>();

      if (abbreviation) {
        const key = normalizeTitle(abbreviation);
        if (!seen.has(key) && key !== normalized) {
          seen.add(key);
          out.push({
            variantText: abbreviation,
            variantType: classifyVariantType(abbreviation),
          });
        }
      }

      return out;
    })();

    const entryType = classifyEntryType(mainTitle);

    const cleanedLines = entry.lines.filter((line) => !isPageNoiseLine(line));

    const senses: ParsedSense[] = [];
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

    const summaryMd = (() => {
      const first = senses[0]!;
      const firstParagraph =
        first.definitionMd.split(/\n\s*\n/)[0]?.trim() ?? '';
      return firstParagraph || first.definitionMd;
    })();
    if (!summaryMd.trim()) continue;

    parsed.push({
      title: mainTitle,
      normalizedTitle: normalized,
      entryType,
      summaryMd,
      senses,
      variants,
      sourceLocator: { line: entry.startLine, title: mainTitle },
    });
  }

  return parsed;
}

type Relationship = DraftEntry['relationships'][number];
type CrossReference = { toSlug: string; type: Relationship['type'] };

/**
 * RFC 4949 definitions end with cross-reference sentences such as
 * "(See: CA domain, security perimeter. Compare: COI, enclave.)". The sentence
 * stays in the definition text; this only mirrors it as relationships.
 */
function parseCrossReferences(
  definitionMd: string,
  fromSlug: string,
): CrossReference[] {
  const out: CrossReference[] = [];
  const seen = new Set<string>([fromSlug]);

  for (const match of definitionMd.matchAll(
    /\b(See|Compare):\s*([\s\S]*?)\.(?=\s|\)|$)/gi,
  )) {
    const type = match[1]!.toLowerCase() === 'see' ? 'SEE_ALSO' : 'CONTRAST';
    for (const raw of (match[2] ?? '').split(',')) {
      // "secondary definition under X" points at X.
      const name = raw
        .replace(/\s+/g, ' ')
        .replace(/^and\s+/i, '')
        .replace(/^.*\bunder\s+/i, '')
        .trim();
      if (!name || name.length > MAX_REFERENCE_LENGTH || name.includes(':'))
        continue;

      const toSlug = slugify(name);
      if (!toSlug || seen.has(toSlug)) continue;
      seen.add(toSlug);
      out.push({ toSlug, type });
    }
  }

  return out;
}

/**
 * Keeps only references that resolve to an entry in this bundle, with that
 * entry's real type. The content compiler rejects relationships to unknown
 * entries, so an unresolved name is dropped rather than guessed.
 */
function resolveRelationships(
  entries: DraftEntry[],
  references: Map<string, CrossReference[]>,
): void {
  const typeBySlug = new Map(
    entries.map((entry) => [entry.slug, entry.entryType]),
  );

  for (const entry of entries) {
    const declared = references.get(entry.slug) ?? [];
    entry.relationships = declared
      .flatMap((reference) => {
        const toType = typeBySlug.get(reference.toSlug);
        if (!toType || reference.toSlug === entry.slug) return [];
        return [{ toType, toSlug: reference.toSlug, type: reference.type }];
      })
      .slice(0, MAX_RELATIONSHIPS);
  }
}

/** Maps parsed RFC entries onto bundle entries, deduplicating slug collisions. */
export function bundleEntriesFromParsed(
  parsed: ParsedEntry[],
  maxItems: number,
): DraftEntry[] {
  const out: DraftEntry[] = [];
  const seenKeys = new Set<string>();
  const references = new Map<string, CrossReference[]>();
  for (const entry of parsed.slice(0, maxItems)) {
    const slug = slugify(entry.title);
    if (!slug) continue;
    const key = `${entry.entryType}:${slug}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    out.push({
      entryType: entry.entryType,
      slug,
      title: entry.title,
      aliases: entry.variants.map((variant) => variant.variantText),
      tags: [],
      summaryMd: entry.summaryMd,
      senses: entry.senses.map((sense, index) => ({
        key: sense.senseLabel
          ? slugify(sense.senseLabel) || `sense-${index + 1}`
          : `sense-${index + 1}`,
        ...(sense.senseLabel ? { label: sense.senseLabel } : {}),
        definitionMd: sense.definitionMd,
        ...(sense.expandedForm ? { expandedForm: sense.expandedForm } : {}),
        examples: [],
        citation: {
          documentKey: DOCUMENT_KEY,
          citationText: `RFC 4949, § "${entry.title}"`,
          locator: `line ${entry.sourceLocator.line}`,
        },
      })),
      relationships: [],
    });
    references.set(
      slug,
      parseCrossReferences(
        entry.senses.map((sense) => sense.definitionMd).join('\n\n'),
        slug,
      ),
    );
  }

  resolveRelationships(out, references);
  return out;
}

export async function runRfc4949(ctx: AdapterContext): Promise<BundleFile> {
  const url = new URL(ctx.source.baseUrl);
  const fetchImpl = ctx.fetch ?? safeFetch;

  const res = await fetchImpl({
    url: url.toString(),
    allowedHosts: [url.hostname],
    allowedContentTypePrefixes: ['text/plain'],
    maxRedirects: 3,
    timeoutMs: 30_000,
    maxBytes: 10 * 1024 * 1024,
    headers: {
      'user-agent': 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)',
      ...conditionalHeaders(ctx.previous, url.toString(), ADAPTER_VERSION),
    },
  });
  // A 304 answers the conditional request above: the copy recorded in the
  // previous bundle is still current, so reuse it whole.
  if (res.status === 304 && ctx.previous) return ctx.previous;
  if (res.status !== 200) {
    throw new Error(
      `RFC 4949 fetch failed (${res.status}) for ${url.toString()}`,
    );
  }

  // Upstream unchanged and parsed by this adapter version: keep the previous
  // bundle byte-identical. A version bump forces a reparse so parser changes land.
  const previousDocument = ctx.previous?.documents.find(
    (doc) => doc.key === DOCUMENT_KEY,
  );
  if (
    ctx.previous?.adapterVersion === ADAPTER_VERSION &&
    previousDocument?.contentSha256 === res.sha256
  ) {
    return ctx.previous;
  }

  const parsed = parseRfc4949Entries(res.body.toString('utf8'));

  return finalizeBundle({
    source: ctx.source,
    adapterVersion: ADAPTER_VERSION,
    documents: [
      {
        key: DOCUMENT_KEY,
        url: url.toString(),
        title: 'RFC 4949: Internet Security Glossary, Version 2',
        contentType: shortContentType(res.contentType, 'text/plain'),
        contentSha256: res.sha256,
        fetchedAt: ctx.now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        ...documentValidators(res),
      },
    ],
    entries: bundleEntriesFromParsed(parsed, ctx.maxItems),
    previous: ctx.previous,
    now: ctx.now,
  });
}
