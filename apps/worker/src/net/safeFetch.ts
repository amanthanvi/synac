import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import type { IncomingMessage } from 'node:http';
import type { LookupAddress } from 'node:dns';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

import {
  isAllowedHostname,
  isForbiddenHostname,
  isForbiddenIp,
} from './ssrf.js';

type SafeFetchResult = {
  url: string;
  status: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  body: Buffer;
  sha256: string;
};

type SafeFetchOptions = {
  url: string;
  allowedHosts: string[];
  allowedContentTypePrefixes: string[];
  maxRedirects: number;
  timeoutMs: number;
  maxBytes: number;
  headers?: Record<string, string>;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function assertHttpsUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only https URLs allowed: ${parsed.toString()}`);
  }
  return parsed;
}

export function assertAllowedContentType(
  contentType: string,
  allowedPrefixes: string[],
): void {
  const okType = allowedPrefixes.some((p) =>
    contentType.toLowerCase().startsWith(p.toLowerCase()),
  );
  if (!okType) {
    throw new Error(`Disallowed content-type: ${contentType || '(missing)'}`);
  }
}

/**
 * `node:stream/web`'s `ReadableStream` and the global one are the same object at runtime;
 * only their declarations are separate, and `Response.body` is declared as
 * `ReadableStream<any>`. These two helpers are the single place that bridges the two, so
 * the rest of the file works with concrete types.
 */
function readWebStream(stream: ReadableStream): AsyncIterable<Uint8Array> {
  return Readable.fromWeb(stream as NodeWebReadableStream<Uint8Array>);
}

function toWebStream(source: IncomingMessage): ReadableStream {
  return Readable.toWeb(source) as ReadableStream;
}

export async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) return Buffer.from([]);

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of readWebStream(response.body)) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new Error(
        `Response too large (${total} bytes > ${maxBytes} bytes)`,
      );
    }
    // A view, not a copy: `Buffer.concat` below does the single copy.
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }

  return Buffer.concat(chunks);
}

/**
 * Resolve `hostname` ONCE, reject the request unless every returned address is public, and
 * hand back a single validated address to pin the socket to.
 *
 * Resolving here and connecting later without pinning is a time-of-check/time-of-use hole: a
 * hostile authoritative DNS server can answer the check with a public address and the
 * connection with 127.0.0.1 or 169.254.169.254. Returning the address (rather than only a
 * boolean) lets the caller connect to exactly what was validated.
 */
async function assertSafeHostname(
  hostname: string,
  allowedHosts: string[],
): Promise<LookupAddress> {
  if (isForbiddenHostname(hostname)) {
    throw new Error(`Forbidden hostname: ${hostname}`);
  }
  if (!isAllowedHostname(hostname, allowedHosts)) {
    throw new Error(`Hostname not in allowlist: ${hostname}`);
  }

  const results = await lookup(hostname, { all: true, verbatim: true });
  for (const r of results) {
    if (isForbiddenIp(r.address)) {
      throw new Error(`Forbidden IP for hostname ${hostname}: ${r.address}`);
    }
  }

  const pinned = results[0];
  if (!pinned) {
    throw new Error(`Hostname did not resolve: ${hostname}`);
  }
  return pinned;
}

/**
 * Perform one hop with the socket pinned to `pinned`, the address that was just validated.
 *
 * Node's global `fetch` cannot be pinned without a custom undici `Dispatcher`, and `undici`
 * is not a resolvable dependency of this package (Node exposes no `node:undici` builtin and
 * pnpm's isolated `node_modules` does not hoist it), so this uses `node:https` directly with
 * a custom `lookup`. The `lookup` option is forwarded to `net.connect`, so the TCP connection
 * goes to the validated address and nothing re-resolves DNS behind our back.
 *
 * TLS is unaffected: `https.request` still derives SNI and the certificate identity from the
 * original `url.hostname`, so certificate hostname verification is exactly as strict as
 * before. Only the address the socket dials is pinned.
 */
function fetchPinned(
  url: URL,
  pinned: LookupAddress,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const req = httpsRequest(
      url,
      {
        method: 'GET',
        headers,
        signal: controller.signal,
        // Pin every DNS resolution for this socket to the already-validated address.
        lookup: (
          _hostname: string,
          options: { all?: boolean },
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number,
          ) => void,
        ) => {
          if (options.all) {
            callback(null, [
              { address: pinned.address, family: pinned.family },
            ]);
            return;
          }
          callback(null, pinned.address, pinned.family);
        },
      },
      (res: IncomingMessage) => {
        clearTimeout(timer);

        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const v of value) responseHeaders.append(key, v);
          } else {
            responseHeaders.append(key, value);
          }
        }

        const status = res.statusCode ?? 0;
        // 204/304 and redirect responses must not carry a body in the web Response model.
        const bodyless =
          status === 204 || status === 304 || isRedirectStatus(status);
        if (bodyless) {
          res.resume();
          resolve(new Response(null, { status, headers: responseHeaders }));
          return;
        }

        resolve(
          new Response(toWebStream(res), { status, headers: responseHeaders }),
        );
      },
    );

    req.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

export async function safeFetch(
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const allowedHosts = options.allowedHosts
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length === 0) throw new Error('allowedHosts is required');

  let current = assertHttpsUrl(options.url);

  for (let i = 0; i <= options.maxRedirects; i += 1) {
    // Re-validated and re-pinned on EVERY hop, not just the first.
    const pinned = await assertSafeHostname(current.hostname, allowedHosts);
    const response = await fetchPinned(
      current,
      pinned,
      options.headers,
      options.timeoutMs,
    );

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location)
        throw new Error(`Redirect without location from ${current.toString()}`);
      if (i === options.maxRedirects) throw new Error('Too many redirects');
      const next = new URL(location, current);
      if (next.protocol !== 'https:') {
        throw new Error(`Redirected to non-https URL: ${next.toString()}`);
      }
      current = next;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    assertAllowedContentType(contentType, options.allowedContentTypePrefixes);

    const body = await readBodyWithLimit(response, options.maxBytes);
    const sha256 = createHash('sha256').update(body).digest('hex');

    return {
      url: current.toString(),
      status: response.status,
      contentType,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      body,
      sha256,
    };
  }

  throw new Error('Unexpected redirect loop');
}
