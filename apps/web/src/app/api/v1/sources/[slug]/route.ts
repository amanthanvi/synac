import { readSource } from '@/lib/convex';

import {
  errorResponse,
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  parseSlug,
  serializeSource,
} from '../../_shared';

export const runtime = 'nodejs';

type SourceContext = { params: Promise<{ slug: string }> };

export function GET(
  request: Request,
  context: SourceContext,
): Promise<Response> {
  return handleReadRequest(request, 'sources.bySlug', async () => {
    const slug = parseSlug((await context.params).slug);
    if (!slug) return errorResponse(request, 400, 'invalid_slug');
    const source = await readSource(slug);
    if (!source) return errorResponse(request, 404, 'not_found');
    return jsonResponse(request, { source: serializeSource(source) });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
