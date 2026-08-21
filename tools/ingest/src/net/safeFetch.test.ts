import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  resolve4: vi.fn<() => Promise<string[]>>(),
  resolve6: vi.fn<() => Promise<string[]>>(),
}));

vi.mock('node:dns/promises', () => ({
  Resolver: class {
    cancel = dnsMocks.cancel;
    resolve4 = dnsMocks.resolve4;
    resolve6 = dnsMocks.resolve6;
  },
}));

import { safeFetch } from './safeFetch.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('safeFetch response timeout', () => {
  it('times out while hostname resolution is stalled', async () => {
    vi.useFakeTimers();
    const rejectLookups: Array<(error: Error) => void> = [];
    dnsMocks.resolve4.mockImplementationOnce(
      () => new Promise((_, reject) => rejectLookups.push(reject)),
    );
    dnsMocks.resolve6.mockImplementationOnce(
      () => new Promise((_, reject) => rejectLookups.push(reject)),
    );
    dnsMocks.cancel.mockImplementationOnce(() => {
      const error = Object.assign(new Error('DNS query cancelled'), {
        code: 'ECANCELLED',
      });
      for (const reject of rejectLookups) reject(error);
    });
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
    expect(dnsMocks.cancel).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts when the response body stalls after headers arrive', async () => {
    vi.useFakeTimers();
    dnsMocks.resolve4.mockResolvedValueOnce(['93.184.216.34']);
    dnsMocks.resolve6.mockResolvedValueOnce([]);

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

    await vi.advanceTimersByTimeAsync(0);
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
