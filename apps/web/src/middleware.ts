import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'synac_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function middleware(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing) return NextResponse.next();

  const response = NextResponse.next();
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

