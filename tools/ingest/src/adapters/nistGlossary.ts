import { normalizeTitle, slugify } from '@synac/content-tools';

import {
  classifyEntryType,
  isInitialism,
  isInitialismOf,
} from '../classify.js';
import { createCrawler } from '../net/crawl.js';
import { safeFetch } from '../net/safeFetch.js';
import {
  extractAllByIdPrefix,
  extractFirstById,
  extractHrefById,
  extractHrefPaths,
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

export const ADAPTER_VERSION = 'nist-glossary/2.0.0';
const INDEX_DOCUMENT_KEY = 'nist-glossary-index';
const USER_AGENT = 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)';
const TERM_FETCH_CONCURRENCY = 8;
const PROGRESS_INTERVAL = 100;
const MAX_SENSES = 50;
const MAX_ALIASES = 50;
const MAX_RELATIONSHIPS = 100;
const TERM_PATH_PREFIX = '/glossary/term/';
const TERM_URL_BASE = 'https://csrc.nist.gov';

export type ParsedNistSense = {
  /** N from `term-def-text-N`; used for the sense key and locator. */
  index: number;
  definitionMd: string;
  label: string | null;
  locator: string;
  citationText: string;
};

export type ParsedNistTerm = {
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  senses: ParsedNistSense[];
  aliases: string[];
  /** Term slugs linked from the abbreviation block that are not real short forms. */
  seeAlso: string[];
};

type RawVariant = { text: string; href: string | null };

function collectVariants(html: string): RawVariant[] {
  const out: RawVariant[] = [];

  // Ids are contiguous per page; a missing index ends the list.
  for (let index = 0; index < MAX_ALIASES * 2; index += 1) {
    const linkText = extractFirstById(html, 'a', `term-abbr-link-${index}`);
    if (linkText) {
      out.push({
        text: linkText,
        href: extractHrefById(html, 'a', `term-abbr-link-${index}`),
      });
      continue;
    }
    const spanText = extractFirstById(html, 'span', `term-abbr-text-${index}`);
    if (spanText) {
      out.push({ text: spanText, href: null });
      continue;
    }
    break;
  }

  return out;
}

/**
 * NIST lists abbreviations, acronyms and synonyms in one block, so an unrelated
 * term can sit next to a real expansion. Only true short-form relations become
 * aliases; everything else is demoted to a SEE_ALSO relationship.
 */
function isAbbreviationRelation(variantText: string, title: string): boolean {
  if (isInitialism(title) && variantText.includes(' ')) return true;
  return isInitialismOf(variantText, title);
}

/** First publication credited for definition N, plus the heading it appears under. */
function senseSource(
  html: string,
  index: number,
  title: string,
): { source: string; label: string } | null {
  const source = extractFirstById(html, 'a', `term-def-src-link-${index}-0`);
  if (!source) return null;

  const under = extractFirstById(html, 'span', `term-def-src-under-${index}-0`);
  const underTerm = under ? under.replace(/^under\s+/i, '').trim() : '';
  const differs =
    Boolean(underTerm) && normalizeTitle(underTerm) !== normalizeTitle(title);

  return { source, label: differs ? `${source} under ${underTerm}` : source };
}

/** Parses a NIST CSRC glossary term page; returns null when title or definitions are missing. */
export function parseNistTermPage(html: string): ParsedNistTerm | null {
  const title = extractFirstById(html, 'h3', 'term-text');
  const definitions = extractAllByIdPrefix(html, 'span', 'term-def-text-');
  if (!title || definitions.length === 0) return null;

  const senses: ParsedNistSense[] = [];
  const senseByText = new Map<
    string,
    { sense: ParsedNistSense; sources: string[] }
  >();

  for (const [index, definitionMd] of definitions.entries()) {
    const credit = senseSource(html, index, title);
    const source = credit?.source ?? null;
    const merged = senseByText.get(definitionMd);

    if (merged) {
      // NIST repeats the same wording across publications; keep one sense.
      if (source && !merged.sources.includes(source)) {
        merged.sources.push(source);
        const [first, ...also] = merged.sources;
        merged.sense.citationText = `NIST CSRC Glossary, "${title}" (${first}${
          also.length ? `, also in ${also.join(', ')}` : ''
        })`;
      }
      continue;
    }

    const sense: ParsedNistSense = {
      index,
      definitionMd,
      label: credit?.label ?? null,
      locator: `#term-def-text-${index}`,
      citationText: source
        ? `NIST CSRC Glossary, "${title}" (${source})`
        : `NIST CSRC Glossary, "${title}"`,
    };
    senses.push(sense);
    senseByText.set(definitionMd, { sense, sources: source ? [source] : [] });
  }

  const normalizedTitle = normalizeTitle(title);
  const aliases: string[] = [];
  const seeAlso: string[] = [];
  const seenVariants = new Set<string>();
  const seenSeeAlso = new Set<string>();

  for (const variant of collectVariants(html)) {
    const key = normalizeTitle(variant.text);
    if (!key || key === normalizedTitle || seenVariants.has(key)) continue;
    seenVariants.add(key);

    if (isAbbreviationRelation(variant.text, title)) {
      aliases.push(variant.text);
      continue;
    }

    if (!variant.href?.startsWith(TERM_PATH_PREFIX)) continue;
    const toSlug = termSlugFromUrl(variant.href);
    if (!toSlug || seenSeeAlso.has(toSlug)) continue;
    seenSeeAlso.add(toSlug);
    seeAlso.push(toSlug);
  }

  return {
    title,
    entryType: classifyEntryType(title),
    senses: senses.slice(0, MAX_SENSES),
    aliases: aliases.slice(0, MAX_ALIASES),
    seeAlso: seeAlso.slice(0, MAX_RELATIONSHIPS),
  };
}

/** Stable natural id for a term page, derived from the /glossary/term/<segment> URL path. */
export function termSlugFromUrl(termUrl: string): string | null {
  const segment =
    new URL(termUrl, TERM_URL_BASE).pathname.split('/').filter(Boolean).pop() ??
    '';
  const slug = slugify(decodeURIComponent(segment));
  return slug || null;
}

export async function runNistGlossary(
  ctx: AdapterContext,
): Promise<BundleFile> {
  const base = new URL(ctx.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const crawler = createCrawler({
    userAgent: USER_AGENT,
    fetchImpl: ctx.fetch ?? safeFetch,
    minDelayMs: ctx.minRequestDelayMs,
  });

  // Only term pages revalidate: a 304 on the index or a letter page would leave
  // this run with no term list to crawl.
  const fetchPage = (url: string, revalidate = false) =>
    crawler.fetch({
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

  const indexUrl = new URL('/glossary', origin).toString();
  const indexRes = await fetchPage(indexUrl);
  if (indexRes.status !== 200) {
    throw new Error(
      `NIST glossary index fetch failed (${indexRes.status}) for ${indexUrl}`,
    );
  }

  const termUrls: string[] = [];
  const seen = new Set<string>();
  const collectTermUrls = (html: string) => {
    for (const href of extractHrefPaths(html, TERM_PATH_PREFIX)) {
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
      throw new Error(
        `NIST glossary index fetch failed (${res.status}) for ${letterUrl}`,
      );
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
      ...documentValidators(indexRes),
    },
  ];
  const entries: DraftEntry[] = [];
  const seeAlsoBySlug = new Map<string, string[]>();
  const seenEntryKeys = new Set<string>();
  const seenDocumentKeys = new Set<string>([INDEX_DOCUMENT_KEY]);
  const termsToFetch = termUrls.slice(0, ctx.maxItems);
  const fetchedTerms = termsToFetch.map((termUrl) => ({
    termUrl,
    result: undefined as Awaited<ReturnType<typeof fetchPage>> | undefined,
  }));
  let nextTermIndex = 0;
  let completedTerms = 0;
  let nextProgress = PROGRESS_INTERVAL;
  let failed = false;
  let firstError: unknown;
  const workerCount = Math.min(TERM_FETCH_CONCURRENCY, fetchedTerms.length);

  console.log(
    `[nist-glossary] fetching ${fetchedTerms.length} term pages (concurrency ${workerCount})`,
  );

  const fetchWorker = async () => {
    while (!failed) {
      const index = nextTermIndex;
      nextTermIndex += 1;
      const term = fetchedTerms[index];
      if (!term) return;

      try {
        term.result = await fetchPage(term.termUrl, true);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        return;
      }
      completedTerms += 1;
      if (
        completedTerms >= nextProgress ||
        completedTerms === fetchedTerms.length
      ) {
        console.log(
          `[nist-glossary] fetched ${completedTerms}/${fetchedTerms.length} term pages`,
        );
        while (nextProgress <= completedTerms)
          nextProgress += PROGRESS_INTERVAL;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, fetchWorker));
  if (failed) throw firstError;

  for (const { termUrl, result: res } of fetchedTerms) {
    if (!res)
      throw new Error(
        `NIST glossary term fetch produced no result for ${termUrl}`,
      );
    if (res.status === 304) {
      // Unchanged since the previous bundle: carry that run's document and the
      // entries citing it forward instead of reparsing a page we did not fetch.
      // Their see-also targets rejoin the pass below, which drops any target
      // this run did not ingest.
      const reused = reusePreviousDocument(ctx.previous, termUrl);
      if (reused && !seenDocumentKeys.has(reused.document.key)) {
        seenDocumentKeys.add(reused.document.key);
        documents.push(reused.document);
        for (const entry of reused.entries) {
          const reusedKey = `${entry.entryType}:${entry.slug}`;
          if (seenEntryKeys.has(reusedKey)) continue;
          seenEntryKeys.add(reusedKey);
          seeAlsoBySlug.set(
            entry.slug,
            entry.relationships.map((relationship) => relationship.toSlug),
          );
          entries.push({ ...entry, relationships: [] });
        }
      }
      continue;
    }
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
      ...documentValidators(res),
    });

    const single = parsed.senses.length === 1;

    entries.push({
      entryType: parsed.entryType,
      slug,
      title: parsed.title,
      aliases: parsed.aliases,
      tags: [],
      summaryMd: parsed.senses[0]!.definitionMd,
      senses: parsed.senses.map((sense) => ({
        key: single ? termSlug : `${termSlug}-${sense.index}`,
        label: sense.label ?? undefined,
        definitionMd: sense.definitionMd,
        examples: [],
        citation: {
          documentKey,
          citationText: sense.citationText,
          locator: sense.locator,
        },
      })),
      relationships: [],
    });
    seeAlsoBySlug.set(slug, parsed.seeAlso);
  }

  // The content compiler rejects relationships to unknown entries, so a target
  // that this run did not ingest is dropped rather than guessed.
  const typeBySlug = new Map(
    entries.map((entry) => [entry.slug, entry.entryType]),
  );
  for (const entry of entries) {
    entry.relationships = (seeAlsoBySlug.get(entry.slug) ?? []).flatMap(
      (toSlug) => {
        const toType = typeBySlug.get(toSlug);
        if (!toType || toSlug === entry.slug) return [];
        return [{ toType, toSlug, type: 'SEE_ALSO' as const }];
      },
    );
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
