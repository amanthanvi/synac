import { buildOpenApiDocument } from '@/lib/openapi';

import { json, publicGet } from '../_shared/publicRoute';

export { OPTIONS } from '../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/v1/openapi.json`: the machine-readable description of this API. */
export const GET = publicGet(
  'api.v1.openapi',
  { scope: 'api_v1_openapi', limit: 60, windowSeconds: 60 },
  async () => json(buildOpenApiDocument()),
);
