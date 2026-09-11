import './test.setup';

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import proxy from './proxy';

type ProxyHandler = (request: NextRequest) => Response | Promise<Response>;

/**
 * `proxy.ts` is exported as `clerkMiddleware(...)` when Clerk is configured and
 * a plain function otherwise. The Clerk env vars are unset under test, so what
 * we exercise here is the unauthenticated branch, which is also the branch that
 * has to 404 the admin surface.
 *
 * `clerkMiddleware` types its second argument as `NextFetchEvent`, which is not
 * constructible outside the Next runtime. Neither branch of the proxy reads it,
 * so the tests call through a one-argument signature.
 */
const runProxy = proxy as ProxyHandler;

function invoke(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; cookie?: string },
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.cookie) headers.set('cookie', init.cookie);

  const request = new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers,
  });
  return Promise.resolve(runProxy(request));
}

describe('proxy security headers', () => {
  it('emits a per-response nonce and the hardened directives', async () => {
    const response = await invoke('http://localhost:3000/term/phishing');
    const csp = response.headers.get('content-security-policy') ?? '';

    const nonce = response.headers.get('X-Nonce');
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);

    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('report-uri /api/v1/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
    expect(response.headers.get('reporting-endpoints')).toContain(
      '/api/v1/csp-report',
    );
  });

  it('narrows img-src and font-src and drops blob: workers', async () => {
    const response = await invoke('http://localhost:3000/');
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain('https://img.clerk.com');
    expect(csp).not.toMatch(/img-src[^;]*https:(?!\/\/)/);
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toContain('worker-src blob:');
  });

  it('gives every response a fresh nonce', async () => {
    const first = await invoke('http://localhost:3000/');
    const second = await invoke('http://localhost:3000/');

    expect(first.headers.get('X-Nonce')).not.toBe(
      second.headers.get('X-Nonce'),
    );
  });

  it('no longer sets a session cookie on public GETs', async () => {
    const response = await invoke('http://localhost:3000/term/phishing');

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('synac_session');
  });
});

describe('proxy request id validation', () => {
  it('passes through a well-formed client request id', async () => {
    const response = await invoke('http://localhost:3000/', {
      headers: { 'x-request-id': 'abc-123_XYZ.9' },
    });

    expect(response.headers.get('x-request-id')).toBe('abc-123_XYZ.9');
  });

  it('replaces an id containing characters that could forge a log line', async () => {
    const response = await invoke('http://localhost:3000/', {
      headers: { 'x-request-id': 'bad id with spaces' },
    });

    const id = response.headers.get('x-request-id') ?? '';
    expect(id).not.toBe('bad id with spaces');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces an over-long id', async () => {
    const response = await invoke('http://localhost:3000/', {
      headers: { 'x-request-id': 'a'.repeat(200) },
    });

    expect(response.headers.get('x-request-id')).toHaveLength(36);
  });
});

describe('proxy cache-control', () => {
  it('marks anonymous public GETs as shared-cacheable', async () => {
    const response = await invoke('http://localhost:3000/term/phishing');

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
    );
  });

  it('does not shared-cache a response for a signed-in visitor', async () => {
    const response = await invoke('http://localhost:3000/term/phishing', {
      cookie: '__session=fake-session-token',
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves non-GET requests uncached', async () => {
    const response = await invoke('http://localhost:3000/term/phishing', {
      method: 'POST',
    });

    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('never shared-caches sign-in or API paths', async () => {
    for (const path of ['/sign-in', '/api/v1/tags']) {
      const response = await invoke(`http://localhost:3000${path}`);
      expect(response.headers.get('cache-control') ?? '').not.toContain(
        's-maxage=60',
      );
    }
  });
});

describe('proxy admin gate', () => {
  it('404s the admin surface when Clerk is not configured', async () => {
    for (const path of ['/admin', '/admin/entries', '/api/v1/admin/tags']) {
      const response = await invoke(`http://localhost:3000${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('does not leak the proxy-continue marker to the client', async () => {
    const response = await invoke('http://localhost:3000/admin');
    expect(response.headers.get('x-synac-proxy-continue')).toBeNull();
  });
});
