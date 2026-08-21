import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

import { lookup } from 'node:dns/promises';

import { safeFetch } from './safeFetch.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('safeFetch response timeout', () => {
  it('times out while hostname resolution is stalled', async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockImplementationOnce(() => new Promise(() => undefined));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = safeFetch({
      url: 'https://example.com/stalled-dns',
      allowedHosts: ['example.com'],
      allowedContentTypePrefixes: ['text/plain'],
      maxRedirects: 0,
      timeoutMs: 100,
      maxBytes: 1024,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts when the response body stalls after headers arrive', async () => {
    vi.useFakeTimers();

    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            bodyController = controller;
            requestSignal?.addEventListener('abort', () => {
              controller.error(
                requestSignal?.reason ??
                  new DOMException('Aborted', 'AbortError'),
              );
            });
          },
        });

        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = safeFetch({
      url: 'https://example.com/stalled',
      allowedHosts: ['example.com'],
      allowedContentTypePrefixes: ['text/plain'],
      maxRedirects: 0,
      timeoutMs: 100,
      maxBytes: 1024,
    });

    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();

    try {
      const rejection = expect(request).rejects.toMatchObject({
        name: 'AbortError',
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(requestSignal?.aborted).toBe(true);
      await rejection;
    } finally {
      if (!requestSignal?.aborted)
        bodyController?.error(new Error('test cleanup'));
      await request.catch(() => undefined);
    }
  });
});
