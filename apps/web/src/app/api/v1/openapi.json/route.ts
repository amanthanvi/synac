import { buildOpenApiDocument } from '@/lib/openapi';

import {
  handleApiReadRequest,
  jsonResponse,
  optionsResponse,
} from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleApiReadRequest(request, 'openapi', async () =>
    jsonResponse(request, buildOpenApiDocument()),
  );
}

export function OPTIONS(): Response {
  return optionsResponse();
}
