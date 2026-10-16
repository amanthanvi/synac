import { readSources } from '@/lib/convex';

import {
  handleApiReadRequest,
  jsonResponse,
  optionsResponse,
  serializeSource,
} from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleApiReadRequest(request, 'sources', async () => {
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
