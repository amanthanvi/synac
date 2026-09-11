/**
 * Why this file is split between end-to-end `safeFetch` calls and direct unit tests of the
 * extracted helpers:
 *
 * `safeFetch` is https-only and refuses any hostname that resolves to a private/loopback
 * address, by design. A test server would necessarily live on 127.0.0.1, so an end-to-end
 * request against it is rejected before a byte is sent, and the correct response to that is
 * to keep the guard, not to loosen it for testability. The rejection paths (non-https,
 * forbidden hostname, hostname not in the allowlist) are therefore asserted through the real
 * `safeFetch`, while the redirect-status, content-type and body-cap paths are asserted
 * against the exact helper functions `safeFetch` itself calls (`isRedirectStatus`,
 * `assertAllowedContentType`, `readBodyWithLimit`) so the tested code is the shipped code.
 */
import { describe, expect, it } from 'vitest';

import {
  assertAllowedContentType,
  assertHttpsUrl,
  isRedirectStatus,
  readBodyWithLimit,
  safeFetch,
} from './safeFetch.js';

const baseOptions = {
  allowedContentTypePrefixes: ['text/html'],
  maxRedirects: 2,
  timeoutMs: 5_000,
  maxBytes: 1024,
};

describe('safeFetch guards', () => {
  it('rejects non-https URLs', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'http://example.com/',
        allowedHosts: ['example.com'],
      }),
    ).rejects.toThrow(/Only https URLs allowed/);
  });

  it('rejects an empty allowlist', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'https://example.com/',
        allowedHosts: [],
      }),
    ).rejects.toThrow(/allowedHosts is required/);
  });

  it('rejects forbidden hostnames', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'https://localhost/x',
        allowedHosts: ['localhost'],
      }),
    ).rejects.toThrow(/Forbidden hostname/);
  });

  it('rejects a loopback literal even when it is allowlisted', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'https://127.0.0.1/x',
        allowedHosts: ['127.0.0.1'],
      }),
    ).rejects.toThrow(/Forbidden IP for hostname/);
  });

  it('rejects a hostname that is not in the allowlist', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'https://evil.example/x',
        allowedHosts: ['example.com'],
      }),
    ).rejects.toThrow(/Hostname not in allowlist/);
  });

  it('rejects a link-local metadata address', async () => {
    await expect(
      safeFetch({
        ...baseOptions,
        url: 'https://169.254.169.254/latest/meta-data/',
        allowedHosts: ['169.254.169.254'],
      }),
    ).rejects.toThrow(/Forbidden IP for hostname/);
  });
});

describe('assertHttpsUrl', () => {
  it('returns a parsed URL for https', () => {
    const url = assertHttpsUrl('https://example.com/a?b=c');
    expect(url.hostname).toBe('example.com');
    expect(url.pathname).toBe('/a');
  });

  it('throws for http, ftp and file', () => {
    for (const url of [
      'http://example.com/',
      'ftp://example.com/',
      'file:///etc/passwd',
    ]) {
      expect(() => assertHttpsUrl(url)).toThrow(/Only https URLs allowed/);
    }
  });

  it('throws for a malformed URL', () => {
    expect(() => assertHttpsUrl('not a url')).toThrow();
  });
});

describe('assertAllowedContentType', () => {
  it('accepts a matching prefix regardless of case or parameters', () => {
    expect(() =>
      assertAllowedContentType('TEXT/HTML; charset=utf-8', ['text/html']),
    ).not.toThrow();
    expect(() =>
      assertAllowedContentType('text/plain', ['TEXT/PLAIN']),
    ).not.toThrow();
  });

  it('throws on a mismatch', () => {
    expect(() =>
      assertAllowedContentType('application/json', ['text/html']),
    ).toThrow(/Disallowed content-type: application\/json/);
  });

  it('throws with "(missing)" when the header is absent', () => {
    expect(() => assertAllowedContentType('', ['text/html'])).toThrow(
      /Disallowed content-type: \(missing\)/,
    );
  });

  it('throws when the allowlist is empty', () => {
    expect(() => assertAllowedContentType('text/html', [])).toThrow(
      /Disallowed content-type/,
    );
  });
});

describe('isRedirectStatus', () => {
  it('recognises the redirect statuses safeFetch follows', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isRedirectStatus(status)).toBe(true);
    }
  });

  it('rejects non-redirect statuses', () => {
    for (const status of [200, 204, 300, 304, 400, 404, 500]) {
      expect(isRedirectStatus(status)).toBe(false);
    }
  });
});

describe('readBodyWithLimit', () => {
  it('reads a body under the cap', async () => {
    const body = await readBodyWithLimit(new Response('hello'), 1024);
    expect(body.toString('utf8')).toBe('hello');
  });

  it('throws when the body exceeds the cap', async () => {
    const big = 'x'.repeat(5000);
    await expect(readBodyWithLimit(new Response(big), 1024)).rejects.toThrow(
      /Response too large/,
    );
  });

  it('reads a chunked stream and enforces the cap across chunks', async () => {
    const makeStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 4; i += 1) {
            controller.enqueue(new TextEncoder().encode('a'.repeat(100)));
          }
          controller.close();
        },
      });

    const ok = await readBodyWithLimit(new Response(makeStream()), 1024);
    expect(ok.length).toBe(400);

    await expect(
      readBodyWithLimit(new Response(makeStream()), 250),
    ).rejects.toThrow(/Response too large/);
  });

  it('returns an empty buffer for a null body', async () => {
    const body = await readBodyWithLimit(
      new Response(null, { status: 204 }),
      1024,
    );
    expect(body.length).toBe(0);
  });
});
