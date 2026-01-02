import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const SESSION_COOKIE = 'synac_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

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

const middlewareWithoutAuth = (request: NextRequest) => {
  return maybeSetSessionCookie(request, NextResponse.next());
};

const middlewareWithAuth = clerkMiddleware((auth, request) => {
  if (isAdminRoute(request)) auth.protect();
  return maybeSetSessionCookie(request, NextResponse.next());
});

export default isClerkConfigured ? middlewareWithAuth : middlewareWithoutAuth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
