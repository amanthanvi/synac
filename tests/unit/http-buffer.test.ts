import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchBufferPinned } from '../../scripts/_http.mjs';

type MockHeaders = {
  get: (name: string) => string | null;
};

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: MockHeaders;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const makeHeaders = (map: Record<string, string> = {}): MockHeaders => {
  return {
    get: (name: string) => {
      const key = Object.keys(map).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? map[key] : null;
    },
  };
};

const okBuf = (
  bytes: number[] = [1, 2, 3],
  headers: Record<string, string> = {},
): MockResponse => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: makeHeaders(headers),
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

const err = (status: number, statusText = 'Error'): MockResponse => ({
  ok: false,
  status,
  statusText,
  headers: makeHeaders(),
  arrayBuffer: async () => new Uint8Array(0).buffer,
});

describe('fetchBufferPinned', () => {
  const realFetch = globalThis.fetch as any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // remove jitter for deterministic delays
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('retries on transient 500 and eventually succeeds, returning a Uint8Array', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 3) return err(500, 'Internal Server Error');
      return okBuf([9, 8, 7]);
    }) as any;

    const p = fetchBufferPinned('https://example.test/retry-500', {}, 3, 1);
    await vi.runAllTimersAsync();

    const buf = await p;
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(Array.from(buf)).toEqual([9, 8, 7]);
    expect(calls).toBe(3);
  });

  it('returns empty Uint8Array on 204 No Content', async () => {
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: makeHeaders(),
        arrayBuffer: async () => new Uint8Array([1]).buffer, // should be ignored for 204
      } as MockResponse;
    }) as any;

    const p = fetchBufferPinned('https://example.test/no-content', {}, 0, 1);
    const buf = await p;
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.byteLength).toBe(0);
  });

  it('does not retry on non-transient 404 and throws', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return err(404, 'Not Found');
    }) as any;

    await expect(fetchBufferPinned('https://example.test/not-found', {}, 3, 1)).rejects.toThrow(
      /HTTP 404/i,
    );
    expect(calls).toBe(1);
  });
  it('does not retry on non-transient 400 and throws', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return err(400, 'Bad Request');
    }) as any;

    await expect(fetchBufferPinned('https://example.test/bad-request', {}, 3, 1)).rejects.toThrow(
      /HTTP 400/i,
    );
    expect(calls).toBe(1);
  });

  it('does not retry on non-transient 403 and throws', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return err(403, 'Forbidden');
    }) as any;

    await expect(fetchBufferPinned('https://example.test/forbidden', {}, 3, 1)).rejects.toThrow(
      /HTTP 403/i,
    );
    expect(calls).toBe(1);
  });

  it('retries on network error (ECONNRESET) and succeeds', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const e = new Error('ECONNRESET');
        (e as any).name = 'FetchError';
        throw e;
      }
      return okBuf([1, 1, 2, 3]);
    }) as any;

    const p = fetchBufferPinned('https://example.test/network', {}, 3, 1);
    await vi.runAllTimersAsync();

    const buf = await p;
    expect(Array.from(buf)).toEqual([1, 1, 2, 3]);
    expect(calls).toBe(3);
  });

  it('enforces MAX_RESPONSE_SIZE by content-length header', async () => {
    // MAX_RESPONSE_SIZE = 50 * 1024 * 1024 (50MB) in implementation
    const tooBig = (50 * 1024 * 1024 + 1).toString();

    globalThis.fetch = vi.fn(async () => {
      return okBuf([0], { 'content-length': tooBig });
    }) as any;

    await expect(fetchBufferPinned('https://example.test/too-big', {}, 0, 1)).rejects.toThrow(
      /Response too large/i,
    );
  });

  it('enforces MAX_RESPONSE_SIZE by actual buffer length', async () => {
    // Simulate unknown content-length but arrayBuffer larger than limit
    const bigLen = 50 * 1024 * 1024 + 5; // 50MB + 5 bytes
    const bigArray = new Uint8Array(bigLen);

    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: makeHeaders(), // no content-length
        arrayBuffer: async () => bigArray.buffer,
      } as MockResponse;
    }) as any;

    await expect(
      fetchBufferPinned('https://example.test/too-big-actual', {}, 0, 1),
    ).rejects.toThrow(/Response too large/i);
  });
});
