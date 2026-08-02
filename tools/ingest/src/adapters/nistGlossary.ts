import { slugify } from '@synac/content-tools';

import { safeFetch } from '../net/safeFetch.js';
import { extractAllByIdPrefix, extractFirstById, extractHrefPaths } from '../html.js';
import { finalizeBundle, type AdapterContext, type DraftDocument, type DraftEntry } from '../bundle.js';
import type { BundleFile } from '@synac/content-tools';

export const ADAPTER_VERSION = 'nist-glossary/1.0.0';
const INDEX_DOCUMENT_KEY = 'nist-glossary-index';
const USER_AGENT = 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)';

type Variant = { variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' };

export type ParsedNistTerm = {
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  definitionMd: string;
  variants: Variant[];
};

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
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

function inferEntryTypeFromTitle(value: string): 'TERM' | 'ACRONYM' {
  const v = value.trim();
  if (!v) return 'TERM';
  if (v.includes(' ')) return 'TERM';
  if (v.length < 2 || v.length > 24) return 'TERM';

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return 'TERM';

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  // Classic initialisms (AAD, TLS, AES, S/MIME, etc.)
  if (uppercase >= 2 && lowercase <= 2) return 'ACRONYM';

  // Short forms like "C2" (Command and Control) have one letter + digits.
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0) return 'ACRONYM';

  return 'TERM';
}

/** Parses a NIST CSRC glossary term page; returns null when title or definition is missing. */
export function parseNistTermPage(html: string): ParsedNistTerm | null {
  const title = extractFirstById(html, 'h3', 'term-text');
  const definitions = extractAllByIdPrefix(html, 'span', 'term-def-text-');
  const definition = definitions[0] ?? null;

  if (!title || !definition) return null;

  const normalizedTitle = normalizeTitle(title);
  const variantsRaw = [
    ...extractAllByIdPrefix(html, 'a', 'term-abbr-link-'),
    ...extractAllByIdPrefix(html, 'span', 'term-abbr-text-'),
  ];
  const seenVariants = new Set<string>();
  const variants = variantsRaw
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && normalizeTitle(v) !== normalizedTitle)
    .filter((v) => {
      const key = normalizeTitle(v);
      if (seenVariants.has(key)) return false;
      seenVariants.add(key);
      return true;
    })
    .map((variantText) => ({
      variantText,
      variantType: inferVariantType(variantText),
    }));

  return {
    title,
    entryType: inferEntryTypeFromTitle(title),
    definitionMd: definition,
    variants,
  };
}

/** Stable natural id for a term page, derived from the /glossary/term/<segment> URL path. */
export function termSlugFromUrl(termUrl: string): string | null {
  const segment = new URL(termUrl).pathname.split('/').filter(Boolean).pop() ?? '';
  const slug = slugify(decodeURIComponent(segment));
  return slug || null;
}

function shortContentType(contentType: string, fallback: string): string {
  return contentType.split(';')[0]!.trim() || fallback;
}

export async function runNistGlossary(ctx: AdapterContext): Promise<BundleFile> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const fetchPage = (url: string) =>
    safeFetch({
      url,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'user-agent': USER_AGENT,
      },
    });

  const indexUrl = new URL('/glossary', origin).toString();
  const indexRes = await fetchPage(indexUrl);
  if (indexRes.status !== 200) {
    throw new Error(`NIST glossary index fetch failed (${indexRes.status}) for ${indexUrl}`);
  }

  const termUrls: string[] = [];
  const seen = new Set<string>();
  const collectTermUrls = (html: string) => {
    for (const href of extractHrefPaths(html, '/glossary/term/')) {
      const abs = new URL(href, origin).toString();
      if (seen.has(abs)) continue;
      seen.add(abs);
      termUrls.push(abs);
      if (termUrls.length >= ctx.maxItems) break;
    }
  };

  collectTermUrls(indexRes.body.toString('utf8'));
  for (const letter of letters) {
    if (termUrls.length >= ctx.maxItems) break;
    const letterUrl = new URL(`/glossary?index=${letter}`, origin).toString();
    const res = await fetchPage(letterUrl);
    if (res.status !== 200) {
      throw new Error(`NIST glossary index fetch failed (${res.status}) for ${letterUrl}`);
    }
    collectTermUrls(res.body.toString('utf8'));
  }

  const fetchedAt = ctx.now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const documents: DraftDocument[] = [
    {
      key: INDEX_DOCUMENT_KEY,
      url: indexUrl,
      title: 'NIST CSRC Glossary index',
      contentType: shortContentType(indexRes.contentType, 'text/html'),
      contentSha256: indexRes.sha256,
      fetchedAt,
    },
  ];
  const entries: DraftEntry[] = [];
  const seenEntryKeys = new Set<string>();
  const seenDocumentKeys = new Set<string>([INDEX_DOCUMENT_KEY]);

  for (const termUrl of termUrls.slice(0, ctx.maxItems)) {
    const res = await fetchPage(termUrl);
    if (res.status !== 200) continue;

    const parsed = parseNistTermPage(res.body.toString('utf8'));
    if (!parsed) continue;

    const slug = slugify(parsed.title);
    if (!slug) continue;
    const entryKey = `${parsed.entryType}:${slug}`;
    if (seenEntryKeys.has(entryKey)) continue;

    const termSlug = termSlugFromUrl(termUrl);
    if (!termSlug) continue;
    const documentKey = `term-${termSlug}`;
    if (seenDocumentKeys.has(documentKey)) continue;

    seenEntryKeys.add(entryKey);
    seenDocumentKeys.add(documentKey);

    documents.push({
      key: documentKey,
      url: termUrl,
      title: parsed.title,
      contentType: shortContentType(res.contentType, 'text/html'),
      contentSha256: res.sha256,
      fetchedAt,
    });

    entries.push({
      entryType: parsed.entryType,
      slug,
      title: parsed.title,
      aliases: parsed.variants.map((variant) => variant.variantText),
      tags: [],
      summaryMd: parsed.definitionMd,
      senses: [
        {
          key: termSlug,
          definitionMd: parsed.definitionMd,
          examples: [],
          citation: {
            documentKey,
            citationText: `NIST CSRC Glossary, "${parsed.title}"`,
            locator: '#term-def-text-0',
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
