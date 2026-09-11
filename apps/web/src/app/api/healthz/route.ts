import { readRecentEntries } from '@/lib/convex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keep in step with the `version` field of apps/web/package.json. */
const VERSION = process.env.npm_package_version ?? '0.2.0';

function healthResponse(ok: boolean): Response {
  return new Response(JSON.stringify({ ok, version: VERSION }), {
    status: ok ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(): Promise<Response> {
  try {
    await readRecentEntries(1, 1);
    return healthResponse(true);
  } catch {
    return healthResponse(false);
  }
}
