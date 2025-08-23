import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the ESM module from the project root
// tests/unit -> ../../ to project root
import { fetchJsonPinned } from '../../scripts/_http.mjs';

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<any>;
};

const ok = (body: any): MockResponse => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => body,
});

const err = (status: number, statusText = 'Error'): MockResponse => ({
  ok: false,
  status,
  statusText,
  json: async () => ({}),
});

describe('fetchJsonPinned', () => {
  const realFetch = globalThis.fetch as any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('retries on transient 500 and eventually succeeds', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 3) return err(500, 'Internal Server Error');
      return ok({ hello: 'world' });
    }) as any;

    const p = fetchJsonPinned('https://example.test/retry-500', {}, 3, 1);

    // Flush all pending timers (backoff + jitter)
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ hello: 'world' });
    expect(calls).toBe(3);
  });

  it('retries on 429 and succeeds', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return err(429, 'Too Many Requests');
      return ok({ rate: 'limited' });
    }) as any;

    const p = fetchJsonPinned('https://example.test/retry-429', {}, 2, 1);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ rate: 'limited' });
    expect(calls).toBe(2);
  });

  it('does not retry on non-transient 404', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return err(404, 'Not Found');
    }) as any;

    await expect(fetchJsonPinned('https://example.test/not-found', {}, 3, 1)).rejects.toThrow(
      /HTTP 404/i,
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
      return ok({ ok: true });
    }) as any;

    const p = fetchJsonPinned('https://example.test/network', {}, 3, 1);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('throws with helpful error when JSON parsing fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new Error('unexpected token');
        },
      } as MockResponse;
    }) as any;

    await expect(fetchJsonPinned('https://example.test/bad-json')).rejects.toThrow(
      /Failed to parse JSON/i,
    );
  });
});
