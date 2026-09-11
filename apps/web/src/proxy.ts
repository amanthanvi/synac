import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const CSP_REPORT_PATH = '/api/v1/csp-report';
const CSP_REPORT_GROUP = 'csp-endpoint';

/**
 * Cache policy for anonymous GETs of public pages.
 *
 * `max-age=0` keeps browsers honest while `s-maxage`/`stale-while-revalidate`
 * let the CDN absorb the traffic. The pages themselves stay *dynamically
 * rendered* (see the nonce note on `buildContentSecurityPolicy`), so this
 * header plus the `unstable_cache` tags on the data loaders is what actually
 * makes the public surface cheap.
 */
const PUBLIC_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

/** Clerk cookies that indicate a signed-in (or mid-handshake) visitor. */
const CLERK_SESSION_COOKIES = ['__session', '__clerk_db_jwt', '__client_uat'];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * A client-supplied `x-request-id` is echoed into logs and error bodies, so it
 * has to be a short, boring token. Otherwise a caller can inject newlines into
 * our structured logs or smuggle a payload into a response we render.
 */
function resolveRequestId(request: NextRequest): string {
  const supplied = request.headers.get('x-request-id')?.trim();
  if (supplied && REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return crypto.randomUUID();
}

/**
 * Next injects its own inline bootstrap scripts on every render, and they can
 * only be allowed by nonce. A nonce must be unique per response, which means
 * the HTML can never be statically cached, hence `dynamic` public pages whose
 * *data* is cached with `unstable_cache` tags instead. Trading a cheap render
 * for a cached query is the right side of that deal; dropping the nonce and
 * allowing `'unsafe-inline'` is not.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';

  const clerk = [
    'https://*.clerk.com',
    'https://*.clerk.dev',
    'https://*.clerk.accounts.dev',
    'https://clerk.synac.app',
    'https://accounts.synac.app',
  ];

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...clerk,
  ].join(' ');
  const connectSrc = [
    "'self'",
    ...(isDev ? ['ws:', 'wss:'] : []),
    ...clerk,
  ].join(' ');
  const frameSrc = ["'self'", ...clerk].join(' ');
  // Clerk serves user avatars from img.clerk.com; everything else we render is
  // first-party or a data: URI. `https:` as a wildcard was letting any host
  // become a beacon.
  const imgSrc = ["'self'", 'data:', 'https://img.clerk.com', ...clerk].join(
    ' ',
  );

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    // Clerk does not require blob: workers for the flows we use.
    "worker-src 'self'",
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-to ${CSP_REPORT_GROUP}`,
    `report-uri ${CSP_REPORT_PATH}`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/v1/admin(.*)']);

function isPublicCacheablePath(pathname: string): boolean {
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/api')) return false;
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))
    return false;
  return true;
}

function isAnonymous(request: NextRequest): boolean {
  return !CLERK_SESSION_COOKIES.some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );
}

function applyCacheControl(request: NextRequest, response: NextResponse): void {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/v1/admin')) {
    response.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
    return;
  }

  if (request.method !== 'GET') return;
  if (!isPublicCacheablePath(pathname)) return;
  // A signed-in visitor sees the same markup, but caching it shared-side risks
  // leaking a personalised header fragment to the next anonymous visitor.
  if (!isAnonymous(request)) {
    response.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
    return;
  }

  response.headers.set('cache-control', PUBLIC_CACHE_CONTROL);
}

function setSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const shouldContinue =
    response.headers.get('x-synac-proxy-continue') !== 'false';
  response.headers.delete('x-synac-proxy-continue');

  const requestId = resolveRequestId(request);
  response.headers.set('x-request-id', requestId);

  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  response.headers.set('x-frame-options', 'DENY');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'strict-transport-security',
      'max-age=15552000; includeSubDomains',
    );
  }

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  response.headers.set('X-Nonce', nonce);
  response.headers.set('content-security-policy', csp);
  response.headers.set(
    'reporting-endpoints',
    `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  );

  applyCacheControl(request, response);

  if (!shouldContinue) return response;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-request-id', requestId);

  const next = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of response.headers) {
    next.headers.set(key, value);
  }

  for (const cookie of response.cookies.getAll()) {
    next.cookies.set(cookie);
  }

  return next;
}

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

const proxyWithoutAuth = (request: NextRequest) => {
  if (isAdminRoute(request)) {
    const response = new NextResponse('Not Found', { status: 404 });
    response.headers.set('x-synac-proxy-continue', 'false');
    return setSecurityHeaders(request, response);
  }

  return setSecurityHeaders(request, NextResponse.next());
};

const proxyWithAuth = clerkMiddleware(async (auth, request) => {
  if (isAdminRoute(request)) await auth.protect();
  return setSecurityHeaders(request, NextResponse.next());
});

export default isClerkConfigured ? proxyWithAuth : proxyWithoutAuth;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
