import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CSP_REPORT_PATH = '/api/v1/csp-report';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(' ');
  const connectSrc = ["'self'", ...(isDev ? ['ws:', 'wss:'] : [])].join(' ');

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "worker-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
    'report-to csp-endpoint',
    `report-uri ${CSP_REPORT_PATH}`,
  ];

  return directives.join('; ');
}

export default function proxy(request: NextRequest) {
  const existingRequestId = request.headers.get('x-request-id');
  const requestId = existingRequestId?.trim()
    ? existingRequestId.trim()
    : crypto.randomUUID();
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('x-request-id', requestId);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('x-frame-options', 'DENY');
  // report-to is only honoured when the endpoint group is declared.
  response.headers.set(
    'reporting-endpoints',
    `csp-endpoint="${CSP_REPORT_PATH}"`,
  );
  response.headers.set('X-Nonce', nonce);
  response.headers.set('content-security-policy', csp);

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'strict-transport-security',
      'max-age=15552000; includeSubDomains',
    );
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
