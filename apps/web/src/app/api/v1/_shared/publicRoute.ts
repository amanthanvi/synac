/**
 * The shape every public GET route shares: rate limit, run the handler, and
 * answer with the standard cache/ETag/CORS headers, or a 304, a 404, or a 429.
 *
 * Routes are then just "read this, serialize it", which is what makes it
 * practical to keep a dozen of them consistent.
 */
import {
  publicJsonResponse,
  publicTextResponse,
  rateLimitedResponse,
  withApiHandler,
  type JsonPayload,
} from '@/lib/apiErrors';
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rateLimit';

/** Shared `OPTIONS` handler; re-export from each public route. */
export { publicOptionsResponse as OPTIONS } from '@/lib/apiErrors';

/** Mirrors the Prisma `EntryType` enum; `@prisma/client` is not a web dependency. */
export type EntryTypeValue = 'TERM' | 'ACRONYM';

export type PublicRouteResult =
  | {
      kind: 'json';
      payload: JsonPayload;
      status?: number;
      headers?: Record<string, string>;
    }
  | {
      kind: 'text';
      body: string;
      contentType: string;
      headers?: Record<string, string>;
    }
  | { kind: 'not-found'; message: string };

type PublicRouteOptions = {
  /** Rate-limit bucket. Scope per route so a heavy export cannot starve search. */
  scope: string;
  limit?: number;
  windowSeconds?: number;
};

export function json(payload: JsonPayload): PublicRouteResult {
  return { kind: 'json', payload };
}

export function notFound(message: string): PublicRouteResult {
  return { kind: 'not-found', message };
}

/** A 4xx that is not a 404: a malformed query parameter, typically. */
export function problem(
  status: number,
  code: string,
  message: string,
): PublicRouteResult {
  return {
    kind: 'json',
    payload: { error: code, message },
    status,
    headers: { 'cache-control': 'public, max-age=0, s-maxage=0' },
  };
}

/** Postgres uuid columns reject anything else, so screen ids before querying. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * `?page=&pageSize=` clamped to a usable range. Junk becomes the default rather
 * than a 400: paging is navigation, not input a caller has to get right.
 */
export function readPagination(
  url: URL,
  defaults?: { pageSize?: number; maxPageSize?: number },
): { page: number; pageSize: number } {
  const defaultPageSize = defaults?.pageSize ?? 20;
  const maxPageSize = defaults?.maxPageSize ?? 100;

  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(
      1,
      Number(url.searchParams.get('pageSize') ?? defaultPageSize) ||
        defaultPageSize,
    ),
  );

  return { page, pageSize };
}

/** `?type=TERM|ACRONYM`. Returns `null` for a value that is neither. */
export function readEntryType(url: URL): EntryTypeValue | undefined | null {
  const raw = url.searchParams.get('type')?.trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'TERM' || raw === 'ACRONYM') return raw;
  return null;
}

export function publicGet<Context = unknown>(
  routeName: string,
  options: PublicRouteOptions,
  handler: (request: Request, context: Context) => Promise<PublicRouteResult>,
): (request: Request, context?: Context) => Promise<Response> {
  return withApiHandler<Context>(routeName, async (request, context) => {
    const decision = await enforceRateLimit({
      request,
      scope: options.scope,
      limit: options.limit ?? 120,
      windowSeconds: options.windowSeconds ?? 60,
    });

    if (!decision.allowed) return rateLimitedResponse(request, decision);

    const limitHeaders = rateLimitHeaders(decision);
    const result = await handler(request, context);

    if (result.kind === 'not-found') {
      return publicJsonResponse(
        request,
        { error: 'not_found', message: result.message },
        {
          status: 404,
          headers: limitHeaders,
          // A 404 is cheap to recompute and may become a 200 the moment an
          // editor publishes; do not let a CDN hold onto it for five minutes.
          cacheControl: 'public, max-age=0, s-maxage=30',
        },
      );
    }

    if (result.kind === 'text') {
      return publicTextResponse(request, result.body, {
        contentType: result.contentType,
        headers: { ...limitHeaders, ...result.headers },
      });
    }

    const init: { status?: number; headers: Record<string, string> } = {
      headers: { ...limitHeaders, ...result.headers },
    };
    if (result.status !== undefined) init.status = result.status;

    return publicJsonResponse(request, result.payload, init);
  });
}
