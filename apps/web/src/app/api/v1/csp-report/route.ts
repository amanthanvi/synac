import { NextResponse } from 'next/server';

import { type JsonPayload } from '@/lib/apiErrors';
import { logger, type LogFields } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Browsers send either spelling of each field; the report body is attacker-influenced text. */
const FIELDS: ReadonlyArray<readonly [name: string, ...keys: string[]]> = [
  ['documentUri', 'document-uri', 'documentURL'],
  ['violatedDirective', 'violated-directive', 'effectiveDirective'],
  ['effectiveDirective', 'effective-directive', 'effectiveDirective'],
  ['blockedUri', 'blocked-uri', 'blockedURL'],
  ['disposition', 'disposition'],
  ['statusCode', 'status-code', 'statusCode'],
];

const MAX_REPORTS = 10;
const MAX_BODY_BYTES = 16_384;

type JsonRecord = { readonly [key: string]: JsonPayload };

function isRecord(value: JsonPayload): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Truncate and strip anything that is not plainly printable. Report fields are
 * URLs and directive names chosen by whatever page triggered the violation, and
 * they land in a structured log, where control characters would let a crafted
 * page forge log lines.
 */
function redact(value: JsonPayload): string | null {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[^\x20-\x7E]/g, '').slice(0, 300);
  return cleaned || null;
}

function summarise(report: JsonRecord): LogFields {
  const summary: Record<string, string | null> = {};
  for (const [name, ...keys] of FIELDS) {
    const raw = keys.map((key) => report[key]).find((v) => v != null);
    summary[name] = redact(raw);
  }
  return summary;
}

/** The two wire formats: a Reporting API batch, or a legacy single `csp-report`. */
function extractReports(body: JsonPayload): JsonRecord[] {
  if (Array.isArray(body)) {
    return body
      .slice(0, MAX_REPORTS)
      .flatMap((item) =>
        isRecord(item) && isRecord(item.body) ? [item.body] : [],
      );
  }

  if (!isRecord(body)) return [];

  const legacy = body['csp-report'];
  return [isRecord(legacy) ? legacy : body];
}

/**
 * `POST /api/v1/csp-report` is the `report-to`/`report-uri` sink for the policy
 * set in `proxy.ts`.
 *
 * Anyone on the internet can post here, so it is rate limited and always
 * answers 204: a report endpoint that reports back is an oracle.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = await enforceRateLimit({
    request,
    scope: 'api_v1_csp_report',
    limit: 60,
    windowSeconds: 60,
  });

  if (!decision.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'retry-after': String(decision.retryAfterSeconds) },
    });
  }

  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      logger.warn('security.csp_report.oversized', { bytes: text.length });
      return new NextResponse(null, { status: 204 });
    }

    // `JSON.parse` only ever yields a JSON value; `extractReports` narrows further.
    for (const report of extractReports(JSON.parse(text) as JsonPayload)) {
      logger.warn('security.csp_report', summarise(report));
    }
  } catch {
    logger.warn('security.csp_report.unparsable');
  }

  return new NextResponse(null, { status: 204 });
}

/** Reports only; an unauthenticated GET would just be a way to probe the route. */
export function GET(): Response {
  return new NextResponse(null, { status: 405, headers: { allow: 'POST' } });
}
