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

export async function fetchJsonPinned(
  url,
  init = {},
  retries = DEFAULT_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
) {
  const ua = 'SynAc-ETL/1.0 (+https://synac.app)';
  const baseHeaders = {
    'user-agent': ua,
    accept: 'application/json',
  };

  // Merge headers (case-insensitive keys preserved as provided)
  const mergedHeaders = { ...baseHeaders, ...(init.headers || {}) };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: mergedHeaders,
        signal: ac.signal,
      });

      if (!res.ok) {
        // Retry on transient HTTP statuses
        if (attempt < retries && isTransientStatus(res.status)) {
          const delay = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          await sleep(delay);
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      // 204 No Content: return null
      if (res.status === 204) {
        return null;
      }

      // Prefer JSON; still attempt to parse as JSON even without explicit header
      try {
        return await res.json();
      } catch (e) {
        throw new Error(`Failed to parse JSON from ${url}: ${e.message || e}`);
      }
    } catch (err) {
      // Retry on network/transient errors
      if (attempt < retries && shouldRetry(err)) {
        const delay = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await sleep(delay);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  // Should not reach here
  throw new Error('fetchJsonPinned: Exhausted retries without a response');
}
