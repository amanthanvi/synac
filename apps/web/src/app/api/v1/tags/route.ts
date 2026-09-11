import { getPrismaClient, listPublicTags } from '@synac/db';

import { json, publicGet } from '../_shared/publicRoute';
import { serializeTag } from '../_shared/serialize';

export { OPTIONS } from '../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/v1/tags`: every tag with its published-entry count. */
export const GET = publicGet(
  'api.v1.tags',
  { scope: 'api_v1_tags', limit: 120, windowSeconds: 60 },
  async () => {
    const tags = await listPublicTags(getPrismaClient());
    return json({
      items: tags.map(serializeTag),
      meta: { total: tags.length },
    });
  },
);
