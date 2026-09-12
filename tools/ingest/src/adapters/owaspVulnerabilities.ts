import { slugify } from '@synac/content-tools';

import { safeFetch } from '../net/safeFetch.js';
import {
  decodeHtmlEntities,
  extractFirstInnerHtmlByClass,
  extractHrefPaths,
  stripHtmlTags,
} from '../html.js';
import {
  conditionalHeaders,
  documentValidators,
  reusePreviousDocument,
} from '../net/conditional.js';
import {
  finalizeBundle,
  shortContentType,
  type AdapterContext,
  type DraftDocument,
  type DraftEntry,
} from '../bundle.js';
import type { BundleFile } from '@synac/content-tools';

export const ADAPTER_VERSION = 'owasp-vulnerabilities/1.0.0';
const INDEX_DOCUMENT_KEY = 'owasp-vulnerabilities-index';
const USER_AGENT = 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)';

export type ParsedOwaspVulnerability = {
  title: string;
  overviewMd: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToText(value: string): string {
  return normalizeText(decodeHtmlEntities(stripHtmlTags(value)));
}

function extractOverviewParagraph(html: string): string | null {
  const section = html.match(
    /<h2[^>]*\bid=["']overview["'][^>]*>[\s\S]*?<\/h2>([\s\S]*?)(<h2|$)/i,
  );
  const block = section?.[1];
  if (!block) return null;
  const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!p?.[1]) return null;
  return htmlToText(p[1]);
}

/** Parses an OWASP community vulnerability page; returns null when title or overview is missing. */
export function parseOwaspVulnerabilityPage(
  html: string,
): ParsedOwaspVulnerability | null {
  const titleHtml = extractFirstInnerHtmlByClass(html, 'h1', 'page-title');
  const title = titleHtml ? htmlToText(titleHtml) : null;
  if (!title) return null;

  const overview = extractOverviewParagraph(html);
  if (!overview) return null;

  return { title, overviewMd: overview };
}

/** Stable natural id for a vulnerability page, from the /www-community/vulnerabilities/<segment> path. */
export function vulnerabilitySlugFromUrl(pageUrl: string): string | null {
  const segment =
    new URL(pageUrl).pathname.split('/').filter(Boolean).pop() ?? '';
  const slug = slugify(decodeURIComponent(segment));
  return slug || null;
}

export async function runOwaspVulnerabilities(
  ctx: AdapterContext,
): Promise<BundleFile> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const fetchImpl = ctx.fetch ?? safeFetch;

  // Only per-vulnerability pages revalidate: a 304 on the index would leave this
  // run with no link list to crawl.
  const fetchPage = (url: string, revalidate = false) =>
    fetchImpl({
      url,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'user-agent': USER_AGENT,
        ...(revalidate
          ? conditionalHeaders(ctx.previous, url, ADAPTER_VERSION)
          : {}),
      },
    });

  const indexUrl = new URL('/www-community/vulnerabilities', origin).toString();
  const indexRes = await fetchPage(indexUrl);
  if (indexRes.status !== 200) {
    throw new Error(
      `OWASP vulnerabilities index fetch failed (${indexRes.status}) for ${indexUrl}`,
    );
  }

  const indexHtml = indexRes.body.toString('utf8');
  const hrefs = extractHrefPaths(indexHtml, '/www-community/vulnerabilities/');

  const seen = new Set<string>();
  const pageUrls: string[] = [];
  for (const href of hrefs) {
    const abs = new URL(href, origin).toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    pageUrls.push(abs);
    if (pageUrls.length >= ctx.maxItems) break;
  }

  const fetchedAt = ctx.now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const documents: DraftDocument[] = [
    {
      key: INDEX_DOCUMENT_KEY,
      url: indexUrl,
      title: 'OWASP Community Vulnerabilities index',
      contentType: shortContentType(indexRes.contentType, 'text/html'),
      contentSha256: indexRes.sha256,
      fetchedAt,
      ...documentValidators(indexRes),
    },
  ];
  const entries: DraftEntry[] = [];
  const seenEntryKeys = new Set<string>();
  const seenDocumentKeys = new Set<string>([INDEX_DOCUMENT_KEY]);

  for (const pageUrl of pageUrls) {
    const res = await fetchPage(pageUrl, true);
    if (res.status === 304) {
      // Unchanged since the previous bundle: carry that run's document and the
      // entries citing it forward instead of reparsing a page we did not fetch.
      const reused = reusePreviousDocument(ctx.previous, pageUrl);
      if (reused && !seenDocumentKeys.has(reused.document.key)) {
        seenDocumentKeys.add(reused.document.key);
        documents.push(reused.document);
        for (const entry of reused.entries) {
          const reusedKey = `${entry.entryType}:${entry.slug}`;
          if (seenEntryKeys.has(reusedKey)) continue;
          seenEntryKeys.add(reusedKey);
          entries.push(entry);
        }
      }
      continue;
    }
    if (res.status !== 200) continue;

    const parsed = parseOwaspVulnerabilityPage(res.body.toString('utf8'));
    if (!parsed) continue;

    const slug = slugify(parsed.title);
    if (!slug) continue;
    const entryKey = `TERM:${slug}`;
    if (seenEntryKeys.has(entryKey)) continue;

    const pageSlug = vulnerabilitySlugFromUrl(pageUrl);
    if (!pageSlug) continue;
    const documentKey = `vuln-${pageSlug}`;
    if (seenDocumentKeys.has(documentKey)) continue;

    seenEntryKeys.add(entryKey);
    seenDocumentKeys.add(documentKey);

    documents.push({
      key: documentKey,
      url: pageUrl,
      title: parsed.title,
      contentType: shortContentType(res.contentType, 'text/html'),
      contentSha256: res.sha256,
      fetchedAt,
      ...documentValidators(res),
    });

    entries.push({
      entryType: 'TERM',
      slug,
      title: parsed.title,
      aliases: [],
      tags: [],
      summaryMd: parsed.overviewMd,
      senses: [
        {
          key: pageSlug,
          definitionMd: parsed.overviewMd,
          examples: [],
          citation: {
            documentKey,
            citationText: `OWASP Community Pages, "${parsed.title}"`,
            locator: '#overview',
          },
        },
      ],
      relationships: [],
    });
  }

  return finalizeBundle({
    source: ctx.source,
    adapterVersion: ADAPTER_VERSION,
    documents,
    entries,
    previous: ctx.previous,
    now: ctx.now,
  });
}
