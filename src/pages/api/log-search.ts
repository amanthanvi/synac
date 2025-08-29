import type { APIRoute } from 'astro';
import { ENABLE_TELEMETRY } from '../../lib/constants';

// This endpoint accepts zero-result search telemetry when ENABLE_TELEMETRY is true.
// Payload format (JSON): { q: string, ts?: number }
// It intentionally stores nothing; returns 204 to confirm receipt.
export const prerender = true;

export const POST: APIRoute = async ({ request }) => {
  if (!ENABLE_TELEMETRY) {
    return new Response(null, { status: 204 });
  }

  try {
    // Enforce JSON content-type softly
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return new Response(null, { status: 204 });
    }

    const body = await request.json().catch(() => ({}) as any);
    const q = typeof body?.q === 'string' ? body.q.slice(0, 256) : '';
    const ts = Number.isFinite(body?.ts) ? Number(body.ts) : Date.now();

    // Basic validation: ignore empty queries
    if (!q) {
      return new Response(null, { status: 204 });
    }

    // Privacy-preserving: do not store; optionally log to server console for future wiring
    try {
      console.log('[telemetry:zero-result]', { q, ts });
    } catch {}

    return new Response(null, { status: 204 });
  } catch {
    // Never fail the client
    return new Response(null, { status: 204 });
  }
};

// Non-POST methods are not supported
export const GET: APIRoute = async () => new Response(null, { status: 204 });
export const PUT: APIRoute = async () => new Response(null, { status: 405 });
export const DELETE: APIRoute = async () => new Response(null, { status: 405 });
