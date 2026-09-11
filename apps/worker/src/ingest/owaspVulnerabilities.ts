import { normalizeTitle, normalizeWhitespace } from '@synac/db';

import { logger } from '../logger.js';
import { buildExtractorVersion } from '../version.js';
import type {
  AdapterContext,
  IngestAdapter,
  JsonObject,
  ParseOutcome,
  ParsedEntry,
} from './adapter.js';
import {
  fetchWithPolicy,
  resolveContentMode,
  upsertSourceDocument,
} from './adapter.js';
import {
  decodeHtmlEntities,
  extractFirstInnerHtmlByClass,
  extractHrefPaths,
  stripHtmlTags,
} from './html.js';
import { normalizeMaxItems } from './textHeuristics.js';

export const ADAPTER_SLUG = 'owasp-vulnerabilities';
export const ADAPTER_VERSION = 'owasp@2';

function htmlToText(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

export function extractOverviewParagraph(html: string): string | null {
  const section = html.match(
    /<h2[^>]*\bid=["']overview["'][^>]*>[\s\S]*?<\/h2>([\s\S]*?)(<h2|$)/i,
  );
  const block = section?.[1];
  if (!block) return null;
  const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const inner = p?.[1];
  if (!inner) return null;
  const text = htmlToText(inner);
  return text || null;
}

export function extractOwaspTitle(html: string): string | null {
  const titleHtml = extractFirstInnerHtmlByClass(html, 'h1', 'page-title');
  if (!titleHtml) return null;
  const title = htmlToText(titleHtml);
  return title || null;
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

  const indexUrl = new URL('/www-community/vulnerabilities', origin).toString();
  const indexFetch = await fetchWithPolicy({
    url: indexUrl,
    source: ctx.source,
    allowedHosts,
    allowedContentTypePrefixes: ['text/html'],
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 15_000,
  });

  if (!indexFetch.ok) {
    return { entries: [], skipped: 1, failed: 0 };
  }
  if (indexFetch.response.status !== 200) {
    throw new Error(
      `OWASP vulnerabilities index fetch failed (${indexFetch.response.status}) for ${indexUrl}`,
    );
  }

  const hrefs = extractHrefPaths(
    indexFetch.response.body.toString('utf8'),
    '/www-community/vulnerabilities/',
  );

  const seen = new Set<string>();
  const pageUrls: string[] = [];
  for (const href of hrefs) {
    const abs = new URL(href, origin).toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    pageUrls.push(abs);
    if (pageUrls.length >= maxItems) break;
  }

  for (const pageUrl of pageUrls) {
    const fetchedAt = new Date();

    const fetched = await fetchWithPolicy({
      url: pageUrl,
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

    const html = res.body.toString('utf8');
    const title = extractOwaspTitle(html);
    const overview = title ? extractOverviewParagraph(html) : null;

    if (!title || !overview) {
      failed += 1;
      logger.debug('ingest.owasp.unparsable_page', {
        url: pageUrl,
        hasTitle: Boolean(title),
      });
      continue;
    }

    const document = await upsertSourceDocument(ctx.prisma, {
      sourceId: ctx.source.id,
      url: pageUrl,
      canonicalUrl: res.url,
      title,
      contentType: res.contentType,
      etag: res.etag,
      lastModified: res.lastModified,
      fetchedAt,
      contentSha256: res.sha256,
      snapshotAllowed: false,
    });

    const sourceLocator = { headingId: 'overview' };

    const extracted: JsonObject = {
      title,
      overviewMd: overview,
      fetchedAt: fetchedAt.toISOString(),
      url: pageUrl,
      canonicalUrl: res.url,
      contentType: res.contentType,
      sha256: res.sha256,
      sourceLocator,
    };
    if (res.etag) extracted.etag = res.etag;
    if (res.lastModified) extracted.lastModified = res.lastModified;

    entries.push({
      itemKey: pageUrl,
      sourceDocumentId: document.id,
      fetchedAt,
      entryType: 'TERM',
      displayTitle: title,
      normalizedTitle: normalizeTitle(title),
      summaryMd: overview,
      senses: [{ definitionMd: overview, sourceLocator }],
      contentMode,
      // HTML pages scraped from owasp.org.
      extractionMethod: 'HTML',
      extractorVersion,
      confidenceScore: 0.85,
      extracted,
    });
  }

  return { entries, skipped, failed };
}

export const owaspVulnerabilitiesAdapter: IngestAdapter = {
  slug: ADAPTER_SLUG,
  version: ADAPTER_VERSION,
  parse,
};
