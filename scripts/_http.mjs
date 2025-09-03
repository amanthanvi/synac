/**
 * scripts/_http.mjs
 * Robust JSON fetch utility with timeout, retries, and exponential backoff with jitter.
 * Used by ETL scripts to pin network behavior and keep payloads deterministic.
 *
 * API:
 *   export async function fetchJsonPinned(
 *     url: string,
 *     init: RequestInit = {},
 *     retries = 3,
 *     backoffMs = 500,
 *   ): Promise<any>
 *
 * Behavior:
 * - Sets a default 30s timeout via AbortController.
 * - Adds a descriptive User-Agent and Accept header (application/json).
 * - Retries on transient failures: network errors, 408/425/429, and 5xx responses.
 * - Exponential backoff with jitter: backoffMs * 2^attempt + random(0..250ms).
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function isTransientStatus(status) {
  // Retry on common transient HTTP statuses
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

function shouldRetry(error, res) {
  if (res) {
    return isTransientStatus(res.status);
  }
  // Network-level errors: AbortError/timeout or common system errors
  const name = error?.name || '';
  const msg = String(error?.message || '').toLowerCase();
  return (
    name === 'AbortError' ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('network')
  );
}

function computeDelay(backoffMs, attempt) {
  return backoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
}

async function doFetchWithRetry(
  url,
  {
    init = {},
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    acceptHeader = '*/*',
    parseFn,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  if (typeof parseFn !== 'function') {
    throw new Error('parseFn is required');
  }
  const ua = 'SynAc-ETL/1.0 (+https://synac.app)';
  const headers = { 'user-agent': ua, accept: acceptHeader, ...(init?.headers || {}) };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers, signal: ac.signal });
      if (!res.ok) {
        if (attempt < retries && isTransientStatus(res.status)) {
          await sleep(computeDelay(backoffMs, attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await parseFn(res);
    } catch (err) {
      if (attempt < retries && shouldRetry(err)) {
        await sleep(computeDelay(backoffMs, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error('Exhausted retries without a response');
}

export async function fetchJsonPinned(
  url,
  init = {},
  retries = DEFAULT_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
) {
  return doFetchWithRetry(url, {
    init,
    retries,
    backoffMs,
    acceptHeader: 'application/json',
    parseFn: async (res) => {
      if (res.status === 204) return null;
      try {
        return await res.json();
      } catch (e) {
        throw new Error(`Failed to parse JSON from ${url}: ${e.message || e}`);
      }
    },
    // timeoutMs defaults inside doFetchWithRetry
  });
}

/**
 * Buffer fetch with same retry/backoff semantics as fetchJsonPinned, delegating to doFetchWithRetry
 * and enforcing a conservative maximum payload size to avoid excessive memory usage.
 */
export async function fetchBufferPinned(
  url,
  init = {},
  retries = DEFAULT_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  return doFetchWithRetry(url, {
    init,
    retries,
    backoffMs,
    acceptHeader: '*/*',
    parseFn: async (res) => {
      if (res.status === 204) return new Uint8Array(0);

      // NOTE: For large files, this approach loads the entire response into memory.
      // To avoid excessive memory usage, we limit the maximum allowed response size.
      // For files larger than MAX_RESPONSE_SIZE, consider using streaming APIs.
      const MAX_RESPONSE_SIZE = 50 * 1024 * 1024; // 50MB

      const contentLengthHeader = res.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_SIZE) {
          throw new Error(
            `Response too large (${contentLength} bytes). Max allowed is ${MAX_RESPONSE_SIZE} bytes. Use streaming for large files.`,
          );
        }
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_SIZE) {
        throw new Error(
          `Response too large (${buf.byteLength} bytes). Max allowed is ${MAX_RESPONSE_SIZE} bytes. Use streaming for large files.`,
        );
      }
      return new Uint8Array(buf);
    },
    timeoutMs,
  });
}
