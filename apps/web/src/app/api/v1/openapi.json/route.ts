import { buildOpenApiDocument } from '@/lib/openapi';

import { handleReadRequest, jsonResponse, optionsResponse } from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'openapi', async () =>
    jsonResponse(request, buildOpenApiDocument()),
  );
}

export function OPTIONS(): Response {
  return optionsResponse();
}
