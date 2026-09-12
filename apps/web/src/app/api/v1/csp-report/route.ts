import { logger } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32 * 1024;

type Violation = {
  effectiveDirective: string;
  blockedOrigin: string;
  disposition: string;
  documentPath: string;
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'unknown';
}

/**
 * Reports can carry the full violating URL. Only the origin of the blocked
 * resource and the path of the document are ever logged, so no query string,
 * fragment, or inline sample reaches the log.
 */
function toOrigin(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'unknown';
  const raw = value.trim();
  try {
    return new URL(raw).origin;
  } catch {
    // CSP keywords such as `inline`, `eval` and `data` are not URLs.
    return /^[a-z-]{1,20}$/i.test(raw) ? raw.toLowerCase() : 'other';
  }
}

function toPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'unknown';
  try {
    return new URL(value.trim()).pathname;
  } catch {
    return 'unknown';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `application/csp-report` bodies wrap a single hyphenated report. */
function fromCspReport(payload: unknown): Violation | null {
  if (!isRecord(payload)) return null;
  const report = payload['csp-report'];
  if (!isRecord(report)) return null;
  return {
    effectiveDirective: firstString(
      report['effective-directive'],
      report['violated-directive'],
    ),
    blockedOrigin: toOrigin(report['blocked-uri']),
    disposition: firstString(report['disposition'], 'enforce'),
    documentPath: toPath(report['document-uri']),
  };
}

/** `application/reports+json` bodies are an array of camelCase reports. */
function fromReportsJson(payload: unknown): Violation[] {
  if (!Array.isArray(payload)) return [];
  const violations: Violation[] = [];
  for (const item of payload) {
    if (!isRecord(item)) continue;
    const body = item['body'];
    if (!isRecord(body)) continue;
    violations.push({
      effectiveDirective: firstString(
        body['effectiveDirective'],
        body['violatedDirective'],
      ),
      blockedOrigin: toOrigin(body['blockedURL']),
      disposition: firstString(body['disposition'], 'enforce'),
      documentPath: toPath(body['documentURL']),
    });
  }
  return violations;
}

/** Reads the body up to maxBytes; null when it is longer than that. */
async function readBodyUpTo(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request): Promise<Response> {
  const verdict = await enforceRateLimit(request.headers);
  if (!verdict.allowed) {
    return new Response(null, {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(
          Math.max(1, Math.ceil(verdict.retryAfterSeconds)),
        ),
      },
    });
  }

  const raw = await readBodyUpTo(request, MAX_BODY_BYTES);
  if (raw !== null) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    const single = fromCspReport(payload);
    const violations = single ? [single] : fromReportsJson(payload);
    for (const violation of violations) {
      logger.warn('csp.violation', violation);
    }
  }

  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
}
