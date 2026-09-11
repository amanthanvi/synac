import { NextResponse } from 'next/server';

import { getPrismaClient } from '@synac/db';

import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION =
  process.env.SYNAC_RELEASE ?? process.env.npm_package_version ?? 'dev';

/**
 * Liveness + readiness in one: a round trip to Postgres proves the process can
 * actually serve, not merely that it is running. The body stays deliberately
 * bare, because a health endpoint is unauthenticated and must not describe the
 * failure it saw.
 */
export async function GET(): Promise<Response> {
  try {
    // Tagged-template form: parameterised by construction.
    await getPrismaClient().$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, version: VERSION },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    logger.error('api.healthz.db_unreachable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, version: VERSION },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
