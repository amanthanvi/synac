import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const SESSION_COOKIE = 'synac_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';

  const clerk = [
    'https://*.clerk.com',
    'https://*.clerk.dev',
    'https://*.clerk.accounts.dev',
    'https://clerk.synac.io',
    'https://accounts.synac.io',
    'https://clerk.synac.app',
    'https://accounts.synac.app',
  ];

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : []), ...clerk].join(' ');
  const connectSrc = ["'self'", ...(isDev ? ['ws:', 'wss:'] : []), ...clerk].join(' ');
  const frameSrc = ["'self'", ...clerk].join(' ');

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "worker-src 'self' blob:",
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

function setSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const shouldContinue = response.headers.get('x-synac-proxy-continue') !== 'false';
  response.headers.delete('x-synac-proxy-continue');

  const existingRequestId = request.headers.get('x-request-id');
  const requestId = existingRequestId?.trim() ? existingRequestId.trim() : crypto.randomUUID();

  response.headers.set('x-request-id', requestId);

  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  response.headers.set('x-frame-options', 'DENY');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains');
  }

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  response.headers.set('content-security-policy', csp);

  if (!shouldContinue) return response;

  const requestHeaders = new Headers(request.headers);
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

const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/v1/admin(.*)']);

function shouldSetSessionCookie(request: NextRequest): boolean {
  if (request.method !== 'GET') return false;

  const pathname = request.nextUrl.pathname;
  if (pathname === '/robots.txt') return false;
  if (pathname.startsWith('/sitemap')) return false;
  if (pathname.startsWith('/api')) return false;
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return false;
  if (pathname.startsWith('/admin')) return false;

  return true;
}

function maybeSetSessionCookie(request: NextRequest, response: NextResponse): NextResponse {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing || !shouldSetSessionCookie(request)) return response;

  response.cookies.set({
    name: SESSION_COOKIE,
    value: crypto.randomUUID(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });

  return response;
}

const proxyWithoutAuth = (request: NextRequest) => {
  if (isAdminRoute(request)) {
    const response = new NextResponse('Not Found', { status: 404 });
    response.headers.set('x-synac-proxy-continue', 'false');
    return setSecurityHeaders(request, response);
  }

  const withCookies = maybeSetSessionCookie(request, NextResponse.next());
  return setSecurityHeaders(request, withCookies);
};

const proxyWithAuth = clerkMiddleware((auth, request) => {
  if (isAdminRoute(request)) auth.protect();
  const withCookies = maybeSetSessionCookie(request, NextResponse.next());
  return setSecurityHeaders(request, withCookies);
});

export default isClerkConfigured ? proxyWithAuth : proxyWithoutAuth;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
