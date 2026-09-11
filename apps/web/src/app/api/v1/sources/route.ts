import { readSources } from '@/lib/convex';

import {
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  serializeSource,
} from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'sources', async () => {
    const sources = await readSources();
    return jsonResponse(request, {
      results: sources.map(serializeSource),
      meta: { total: sources.length },
    });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
