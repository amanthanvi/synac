import { getPrismaClient, listPublicSourcesWithStats } from '@synac/db';

import { json, publicGet } from '../_shared/publicRoute';
import { LICENSE, serializeSource } from '../_shared/serialize';

export { OPTIONS } from '../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/v1/sources`: enabled sources with licence terms and citation stats. */
export const GET = publicGet(
  'api.v1.sources',
  { scope: 'api_v1_sources', limit: 120, windowSeconds: 60 },
  async () => {
    const sources = await listPublicSourcesWithStats(getPrismaClient());
    return json({
      items: sources.map(serializeSource),
      meta: { total: sources.length },
      license: LICENSE,
    });
  },
);
