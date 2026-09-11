import { normalizeTitle, normalizeWhitespace } from '@synac/db';

import { logger } from '../logger.js';
import { buildExtractorVersion } from '../version.js';
import type {
  AdapterContext,
  IngestAdapter,
  JsonObject,
  ParseOutcome,
  ParsedEntry,
  ParsedSense,
} from './adapter.js';
import {
  fetchWithPolicy,
  resolveContentMode,
  upsertSourceDocument,
} from './adapter.js';
import {
  extractAllByIdPrefix,
  extractFirstById,
  extractHrefPaths,
} from './html.js';
import {
  buildVariants,
  inferEntryTypeFromTitle,
  normalizeMaxItems,
} from './textHeuristics.js';

export const ADAPTER_SLUG = 'nist-csrc-glossary';
export const ADAPTER_VERSION = 'nist@2';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * NIST renders a per-definition provenance line such as
 * `Source(s): NIST SP 800-53 Rev. 5 under Access Control`.
 * The upstream publication is what disambiguates the definitions from one
 * another, so it becomes the sense label.
 */
export function parseNistSourceLabel(raw: string | undefined): string | null {
  if (!raw) return null;

  let text = normalizeWhitespace(raw);
  if (!text) return null;

  text = text
    .replace(/^Sources?\s*\(s\)\s*:\s*/i, '')
    .replace(/^Sources?\s*:\s*/i, '');
  // "NIST SP 800-53 Rev. 5 under Access Control" -> "NIST SP 800-53 Rev. 5"
  text = text.split(/\s+under\s+/i)[0] ?? text;
  // Several publications may be listed; the first is the primary attribution.
  text = text.split(/\s+from\s+/i)[0] ?? text;
  text = normalizeWhitespace(text.replace(/[;,]\s*$/, ''));

  if (!text || text.length > 200) return null;
  return text;
}

/**
 * Pairs definition spans with their source lines positionally. NIST emits
 * `#term-def-text-N` and `#term-def-source-N` in matching document order, but
 * an occasional definition carries no source line; in that case the counts
 * disagree and every label is left null rather than mis-attributed.
 */
export function pairDefinitionsWithSources(
  definitions: string[],
  sources: string[],
): Array<{ definition: string; senseLabel: string | null; index: number }> {
  const aligned = sources.length === definitions.length;

  return definitions.map((definition, index) => ({
    definition,
    senseLabel: aligned ? parseNistSourceLabel(sources[index]) : null,
    index,
  }));
}

export function parseNistTermPage(html: string): {
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  senses: Array<{
    definitionMd: string;
    senseLabel: string | null;
    selector: string;
  }>;
  variants: Array<{
    variantText: string;
    variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING';
  }>;
} | null {
  const title = extractFirstById(html, 'h3', 'term-text');
  if (!title) return null;

  const definitions = extractAllByIdPrefix(html, 'span', 'term-def-text-');
  if (definitions.length === 0) return null;

  // The source line's element varies between div and span across NIST templates.
  const sourcesFromDiv = extractAllByIdPrefix(html, 'div', 'term-def-source-');
  const sourcesFromSpan = extractAllByIdPrefix(
    html,
    'span',
    'term-def-source-',
  );
  const sources =
    sourcesFromDiv.length >= sourcesFromSpan.length
      ? sourcesFromDiv
      : sourcesFromSpan;

  const normalizedTitle = normalizeTitle(title);
  const variants = buildVariants(
    [
      ...extractAllByIdPrefix(html, 'a', 'term-abbr-link-'),
      ...extractAllByIdPrefix(html, 'span', 'term-abbr-text-'),
    ],
    normalizedTitle,
  );

  const senses = pairDefinitionsWithSources(definitions, sources).flatMap(
    (d) => {
      const definitionMd = d.definition.trim();
      if (!definitionMd) return [];
      return [
        {
          definitionMd,
          senseLabel: d.senseLabel,
          selector: `#term-def-text-${d.index}`,
        },
      ];
    },
  );

  if (senses.length === 0) return null;

  return {
    title,
    entryType: inferEntryTypeFromTitle(title),
    senses,
    variants,
  };
}

async function parse(ctx: AdapterContext): Promise<ParseOutcome> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const maxItems = normalizeMaxItems(ctx.maxItems);

  const contentMode = resolveContentMode({
    defaultContentMode: ctx.source.defaultContentMode,
    verbatimOnly: true,
  });
  const extractorVersion = buildExtractorVersion(ADAPTER_VERSION);

  const entries: ParsedEntry[] = [];
  let skipped = 0;
  let failed = 0;

  const termUrls: string[] = [];
  const seen = new Set<string>();

  const indexUrls = [
    new URL('/glossary', origin).toString(),
    ...LETTERS.map((l) => new URL(`/glossary?index=${l}`, origin).toString()),
  ];

  for (const indexUrl of indexUrls) {
    if (seen.size >= maxItems) break;

    const fetched = await fetchWithPolicy({
      url: indexUrl,
      source: ctx.source,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 15_000,
    });

    if (!fetched.ok) {
      skipped += 1;
      continue;
    }
    if (fetched.response.status !== 200) {
      throw new Error(
        `NIST glossary index fetch failed (${fetched.response.status}) for ${indexUrl}`,
      );
    }

    for (const href of extractHrefPaths(
      fetched.response.body.toString('utf8'),
      '/glossary/term/',
    )) {
      const abs = new URL(href, origin).toString();
      if (seen.has(abs)) continue;
      seen.add(abs);
      termUrls.push(abs);
      if (seen.size >= maxItems) break;
    }
  }

  for (const termUrl of termUrls.slice(0, maxItems)) {
    const fetchedAt = new Date();

    const fetched = await fetchWithPolicy({
      url: termUrl,
      source: ctx.source,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 15_000,
    });

    if (!fetched.ok) {
      skipped += 1;
      continue;
    }

    const res = fetched.response;
    if (res.status !== 200) {
      skipped += 1;
      continue;
    }

    const parsed = parseNistTermPage(res.body.toString('utf8'));
    if (!parsed) {
      failed += 1;
      logger.debug('ingest.nist.unparsable_page', { url: termUrl });
      continue;
    }

    const document = await upsertSourceDocument(ctx.prisma, {
      sourceId: ctx.source.id,
      url: termUrl,
      canonicalUrl: res.url,
      title: parsed.title,
      contentType: res.contentType,
      etag: res.etag,
      lastModified: res.lastModified,
      fetchedAt,
      contentSha256: res.sha256,
      snapshotAllowed: false,
    });

    const senses: ParsedSense[] = parsed.senses.map((s) => ({
      senseLabel: s.senseLabel,
      definitionMd: s.definitionMd,
      sourceLocator: { selector: s.selector },
    }));

    const firstSense = senses[0];
    if (!firstSense) {
      failed += 1;
      continue;
    }

    const extracted: JsonObject = {
      title: parsed.title,
      definitions: parsed.senses.map((s) => ({
        definitionMd: s.definitionMd,
        senseLabel: s.senseLabel,
        selector: s.selector,
      })),
      variants: parsed.variants,
      fetchedAt: fetchedAt.toISOString(),
      url: termUrl,
      canonicalUrl: res.url,
      contentType: res.contentType,
      sha256: res.sha256,
      sourceLocator: { selector: '#term-def-text-0' },
    };
    if (res.etag) extracted.etag = res.etag;
    if (res.lastModified) extracted.lastModified = res.lastModified;

    entries.push({
      itemKey: termUrl,
      sourceDocumentId: document.id,
      fetchedAt,
      entryType: parsed.entryType,
      displayTitle: parsed.title,
      normalizedTitle: normalizeTitle(parsed.title),
      summaryMd: firstSense.definitionMd,
      senses,
      variants: parsed.variants,
      contentMode,
      // HTML pages scraped from csrc.nist.gov.
      extractionMethod: 'HTML',
      extractorVersion,
      confidenceScore: 0.9,
      extracted,
    });
  }

  return { entries, skipped, failed };
}

export const nistGlossaryAdapter: IngestAdapter = {
  slug: ADAPTER_SLUG,
  version: ADAPTER_VERSION,
  parse,
};
