import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';

import { isAllowedHostname, isForbiddenHostname, isForbiddenIp } from './ssrf.js';

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

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.from([]);

  const chunks: Buffer[] = [];
  let total = 0;

  const stream = Readable.fromWeb(response.body as unknown as ReadableStream);
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Response too large (${total} bytes > ${maxBytes} bytes)`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

async function assertSafeHostname(hostname: string, allowedHosts: string[]) {
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
}

export async function safeFetch(options: SafeFetchOptions): Promise<SafeFetchResult> {
  const allowedHosts = options.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length === 0) throw new Error('allowedHosts is required');

  let current = new URL(options.url);
  if (current.protocol !== 'https:') {
    throw new Error(`Only https URLs allowed: ${current.toString()}`);
  }

  for (let i = 0; i <= options.maxRedirects; i += 1) {
    await assertSafeHostname(current.hostname, allowedHosts);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), options.timeoutMs);

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        headers: options.headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect without location from ${current.toString()}`);
      if (i === options.maxRedirects) throw new Error('Too many redirects');
      current = new URL(location, current);
      if (current.protocol !== 'https:') {
        throw new Error(`Redirected to non-https URL: ${current.toString()}`);
      }
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const okType = options.allowedContentTypePrefixes.some((p) =>
      contentType.toLowerCase().startsWith(p.toLowerCase()),
    );
    if (!okType) {
      throw new Error(`Disallowed content-type: ${contentType || '(missing)'}`);
    }

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

