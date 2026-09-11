import { NextResponse } from 'next/server';

import { logger } from './logger';

/**
 * A value that survives `JSON.stringify` unchanged. Response bodies are typed
 * with this rather than `unknown` so a route cannot hand back something that
 * silently serialises to `{}`.
 */
export type JsonPayload =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly JsonPayload[]
  | { readonly [key: string]: JsonPayload };

/**
 * An error with an externally-meaningful code. The `code` and `message` of a
 * `DomainError` are safe to return to the caller, unlike an arbitrary thrown
 * error whose message may carry connection strings, SQL, or stack context.
 */
class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

export function notFoundError(message = 'Not found'): DomainError {
  return new DomainError('not_found', message, 404);
}

/**
 * The admin write helpers in `lib/admin*.ts` predate `DomainError` and signal
 * failure with plain `Error`s whose messages editors rely on. Map the shapes we
 * author ourselves onto proper status codes; anything unrecognised stays a
 * generic 500 so we never echo an unexpected message back to a caller.
 */
const LEGACY_ERROR_RULES: ReadonlyArray<{
  test: RegExp;
  code: string;
  status: number;
}> = [
  { test: /not found$/i, code: 'not_found', status: 404 },
  { test: /^no rollback snapshot available$/i, code: 'not_found', status: 404 },
  { test: /already exists/i, code: 'conflict', status: 409 },
  { test: /already taken/i, code: 'conflict', status: 409 },
  { test: /reserved by history/i, code: 'conflict', status: 409 },
  { test: /too many collisions/i, code: 'conflict', status: 409 },
  { test: /is required/i, code: 'unprocessable', status: 422 },
  { test: /^cannot /i, code: 'unprocessable', status: 422 },
  { test: /^publishing requires/i, code: 'unprocessable', status: 422 },
  { test: /^unsupported /i, code: 'unprocessable', status: 422 },
  { test: /^invalid /i, code: 'unprocessable', status: 422 },
  { test: /must (be|use|have)/i, code: 'unprocessable', status: 422 },
  { test: /^source is disabled$/i, code: 'unprocessable', status: 422 },
  { test: /^staging source/i, code: 'unprocessable', status: 422 },
  { test: /does not match/i, code: 'unprocessable', status: 422 },
  { test: /^entry not found for /i, code: 'not_found', status: 404 },
];

/** `error` is `unknown` because that is what TypeScript gives a `catch` binding. */
function toDomainError(error: unknown): DomainError | null {
  if (error instanceof DomainError) return error;
  if (!(error instanceof Error)) return null;

  const message = error.message.trim();
  if (!message || message.length > 300) return null;

  for (const rule of LEGACY_ERROR_RULES) {
    if (rule.test.test(message)) {
      return new DomainError(rule.code, message, rule.status);
    }
  }

  return null;
}

type ApiErrorBody = {
  error: string;
  requestId?: string;
  message?: string;
};

export function getRequestId(request: Request): string | undefined {
  const raw = request.headers.get('x-request-id')?.trim();
  return raw ? raw : undefined;
}

function errorResponse(status: number, body: ApiErrorBody): NextResponse {
  return NextResponse.json(body, { status });
}

type RouteHandler<Context> = (
  request: Request,
  context: Context,
) => Promise<Response> | Response;

/**
 * Wrap a route handler so no throw ever escapes as an unshaped 500. Known
 * domain failures map to 404/409/422 with their message; everything else logs
 * with the request id and returns `{ error: 'internal_error', requestId }`,
 * so the caller gets an id to quote and we keep the stack.
 */
export function withApiHandler<Context = unknown>(
  routeName: string,
  handler: RouteHandler<Context>,
): (request: Request, context?: Context) => Promise<Response> {
  return async (request: Request, context?: Context): Promise<Response> => {
    const requestId = getRequestId(request);
    const startedAt = Date.now();

    try {
      // `context` is optional in the exported signature so a route with no
      // dynamic segment can be invoked (and unit-tested) as `GET(request)`.
      // Next always supplies it for routes with params; routes without params
      // never read it.
      return await handler(request, context as Context);
    } catch (error) {
      const domain = toDomainError(error);

      if (domain) {
        logger.warn(`${routeName}.rejected`, {
          requestId,
          code: domain.code,
          status: domain.status,
          durationMs: Date.now() - startedAt,
        });
        return errorResponse(domain.status, {
          error: domain.code,
          message: domain.message,
          requestId,
        });
      }

      logger.error(`${routeName}.error`, {
        requestId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return errorResponse(500, { error: 'internal_error', requestId });
    }
  };
}

/**
 * Every public `GET /api/v1/*` answers with the same caching, validation, and
 * CORS story, so a consumer can rely on it without reading each route:
 *
 * - `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=3600`
 * - a strong-ish `ETag` (sha1 of the body) with `If-None-Match` -> 304
 * - `Access-Control-Allow-Origin: *` (the data is public; there are no cookies
 *   or credentials involved, so a wildcard is the honest answer)
 * - `Vary: Accept-Encoding`
 */
const PUBLIC_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'content-type, if-none-match, x-request-id',
  'access-control-max-age': '86400',
};

/** Preflight/OPTIONS response for a public GET route. */
export function publicOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, vary: 'Accept-Encoding' },
  });
}

async function sha1Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}` || value === '*');
}

/**
 * Serialise `payload`, attach the public cache/CORS/ETag headers, and answer
 * 304 when the caller's `If-None-Match` already matches.
 */
export async function publicJsonResponse(
  request: Request,
  payload: JsonPayload,
  init?: {
    status?: number;
    headers?: Record<string, string>;
    cacheControl?: string;
  },
): Promise<Response> {
  const body = JSON.stringify(payload);
  const etag = `"${await sha1Hex(body)}"`;

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': init?.cacheControl ?? PUBLIC_CACHE_CONTROL,
    etag,
    vary: 'Accept-Encoding',
    ...CORS_HEADERS,
    ...init?.headers,
  };

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: init?.status ?? 200, headers });
}

/** Same conventions, for a non-JSON body (CSV export). */
export async function publicTextResponse(
  request: Request,
  body: string,
  init: {
    contentType: string;
    headers?: Record<string, string>;
    cacheControl?: string;
  },
): Promise<Response> {
  const etag = `"${await sha1Hex(body)}"`;

  const headers: Record<string, string> = {
    'content-type': init.contentType,
    'cache-control': init.cacheControl ?? PUBLIC_CACHE_CONTROL,
    etag,
    vary: 'Accept-Encoding',
    ...CORS_HEADERS,
    ...init.headers,
  };

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
}

/** 429 body shared by every rate-limited public route. */
export function rateLimitedResponse(
  request: Request,
  decision: { retryAfterSeconds: number; limit: number; remaining: number },
): Response {
  return NextResponse.json(
    {
      error: 'rate_limited',
      requestId: getRequestId(request),
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'retry-after': String(decision.retryAfterSeconds),
        'x-ratelimit-limit': String(decision.limit),
        'x-ratelimit-remaining': String(decision.remaining),
        ...CORS_HEADERS,
      },
    },
  );
}
