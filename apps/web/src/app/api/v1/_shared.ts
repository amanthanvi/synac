import crypto from 'node:crypto';

import { senseAnchorId } from '@synac/shared';

import type {
  EntryType,
  PublicEntry,
  PublicEntrySense,
  PublicSenseAttestation,
  PublicSenseCitation,
  PublicSource,
} from '@/lib/convex';
import { logger } from '@/lib/logger';
import { entryPath, senseHeadingText } from '@/lib/publicEntryPage';
import { enforceRateLimit } from '@/lib/rateLimit';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

const READ_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';
const ALLOWED_METHODS = 'GET, OPTIONS';
const ALLOWED_HEADERS = 'content-type, if-none-match';

const DEFAULT_SITE_URL = 'https://synac.app';
const BROWSE_LETTERS = [...'abcdefghijklmnopqrstuvwxyz', '0-9'];
const MAX_SLUG_LENGTH = 128;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

export function entryUrl(entryType: EntryType, slug: string): string {
  return `${siteOrigin()}${entryPath(entryType, slug)}`;
}

/**
 * The proxy sets x-request-id on every request; the value is echoed into error
 * bodies, so anything outside the shape it generates is discarded rather than
 * reflected back to the caller.
 */
function requestIdOf(request: Request): string {
  const raw = (request.headers.get('x-request-id') ?? '').trim();
  return REQUEST_ID_PATTERN.test(raw) ? raw : 'unknown';
}

export function computeEtag(serialized: string): string {
  return `"${crypto.createHash('sha1').update(serialized).digest('hex')}"`;
}

/** If-None-Match is a comma list of entity tags, `*`, or the weak `W/` form. */
export function etagSatisfies(
  ifNoneMatch: string | null,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  const target = etag.replace(/^W\//, '');
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === '*' || candidate.replace(/^W\//, '') === target,
    );
}

function readHeaders(etag: string): Headers {
  return new Headers({
    'content-type': JSON_CONTENT_TYPE,
    'cache-control': READ_CACHE_CONTROL,
    etag,
    vary: 'Accept-Encoding',
    'access-control-allow-origin': '*',
  });
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

export function jsonResponse(request: Request, body: JsonValue): Response {
  const serialized = JSON.stringify(body);
  const etag = computeEtag(serialized);
  const headers = readHeaders(etag);
  if (etagSatisfies(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(serialized, { status: 200, headers });
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': ALLOWED_METHODS,
      'access-control-allow-headers': ALLOWED_HEADERS,
    },
  });
}

export function errorResponse(
  request: Request,
  status: number,
  error: string,
): Response {
  return new Response(
    JSON.stringify({ error, requestId: requestIdOf(request) }),
    {
      status,
      headers: {
        'content-type': JSON_CONTENT_TYPE,
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    },
  );
}

function rateLimitedResponse(request: Request, retryAfter: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfter));
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      requestId: requestIdOf(request),
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'content-type': JSON_CONTENT_TYPE,
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'retry-after': String(retryAfterSeconds),
      },
    },
  );
}

/**
 * Every v1 read route shares one rate-limit scope and one failure mode: an
 * unhandled error must never leak a stack or an internal message to a caller.
 */
export async function handleReadRequest(
  request: Request,
  routeName: string,
  handler: (url: URL) => Promise<Response>,
): Promise<Response> {
  const requestId = requestIdOf(request);
  try {
    const verdict = await enforceRateLimit(request.headers);
    if (!verdict.allowed) {
      logger.warn('api.v1.rate_limited', {
        route: routeName,
        requestId,
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
      return rateLimitedResponse(request, verdict.retryAfterSeconds);
    }
    return await handler(new URL(request.url));
  } catch (error) {
    logger.error('api.v1.error', {
      route: routeName,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(request, 500, 'internal_error');
  }
}

export function parsePage(value: string | null, maxPage: number): number {
  const parsed = Math.floor(Number(value ?? 1));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(maxPage, parsed));
}

export function parsePageSize(
  value: string | null,
  fallback: number,
  maxPageSize: number,
): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maxPageSize, parsed));
}

export function parseLetter(value: string | null): string {
  const letter = (value ?? 'a').trim().toLowerCase();
  return BROWSE_LETTERS.includes(letter) ? letter : 'a';
}

export function parseSlug(value: string | null): string | null {
  const slug = (value ?? '').trim().toLowerCase();
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null;
  return SLUG_PATTERN.test(slug) ? slug : null;
}

type ApiCitation = {
  sourceSlug: string;
  sourceName: string;
  url: string;
  documentTitle: string | null;
  citationText: string | null;
  locator: string | null;
  contentMode: string;
  documentSha256: string;
  attributionText: string;
  accessedAt: string;
  licenseNote: string | null;
  licenseUrl: string | null;
  publicStatement: string | null;
};

export function serializeCitation(citation: PublicSenseCitation): ApiCitation {
  return {
    sourceSlug: citation.sourceSlug,
    sourceName: citation.sourceName,
    url: citation.url,
    documentTitle: citation.documentTitle ?? null,
    citationText: citation.citationText ?? null,
    locator: citation.locator ?? null,
    contentMode: citation.contentMode,
    documentSha256: citation.documentSha256,
    attributionText: citation.attributionText,
    accessedAt: new Date(citation.accessedAt).toISOString(),
    licenseNote: citation.licenseNote ?? null,
    licenseUrl: citation.licenseUrl ?? null,
    publicStatement: citation.publicStatement ?? null,
  };
}

export function serializeAttestation(attestation: PublicSenseAttestation) {
  return {
    key: attestation.key,
    sourceSlug: attestation.sourceSlug,
    sourceName: attestation.sourceName,
    definitionText: attestation.definitionText,
    citation: serializeCitation(attestation.citation),
  };
}

export function senseHeading(
  sense: PublicEntrySense,
  entryType: 'TERM' | 'ACRONYM',
): string {
  return senseHeadingText(sense, entryType);
}

function serializeSense(sense: PublicEntrySense) {
  return {
    key: sense.key,
    anchor: senseAnchorId(sense.key),
    order: sense.order,
    label: sense.label,
    labelFallback: sense.labelFallback,
    expandedForm: sense.expandedForm,
    disambiguationNote: sense.disambiguationNote,
    definitionText: sense.definitionText,
    definitionMd: sense.definitionMd,
    isEditorial: sense.isEditorial,
    editorialRationale: sense.editorialRationale,
    isPreferred: sense.isPreferred,
    examples: sense.examples.map((example) => ({
      md: example.md,
      text: example.text,
    })),
    attestations: sense.attestations.map(serializeAttestation),
    citations: sense.citations.map(serializeCitation),
  };
}

export function serializeEntry(entry: PublicEntry) {
  return {
    entryType: entry.entryType,
    slug: entry.slug,
    canonicalUrl: entryUrl(entry.entryType, entry.slug),
    title: entry.title,
    aliases: entry.aliases,
    summary: entry.summaryText,
    summaryMd: entry.summaryMd,
    editorialNotes: entry.editorialNotes,
    updatedAt: new Date(entry.updatedAt).toISOString(),
    tags: entry.tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      assignedBy: tag.assignedBy,
    })),
    senses: entry.senses.map(serializeSense),
  };
}

export function serializeSource(source: PublicSource) {
  return {
    slug: source.slug,
    name: source.name,
    baseUrl: source.baseUrl,
    licenseType: source.licenseType,
    licenseUrl: source.licenseUrl,
    licenseNotes: source.licenseNotes,
    publicStatement: source.publicStatement,
    contentMode: source.contentMode,
    allowedUse: source.allowedUse,
    attributionRequirements: source.attributionRequirements,
    trustTier: source.trustTier,
    enabled: source.enabled,
    lastVerifiedAt: new Date(source.lastVerifiedAt).toISOString(),
    citedEntryCount: source.citedEntryCount,
    url: `/sources/${source.slug}`,
  };
}
