import { getPrismaClient, getPublicSourceWithEntries } from '@synac/db';

import {
  json,
  notFound,
  publicGet,
  readPagination,
} from '../../_shared/publicRoute';
import {
  LICENSE,
  pageMeta,
  serializeEntryListItem,
  serializeSource,
} from '../../_shared/serialize';

export { OPTIONS } from '../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/** `GET /api/v1/sources/{slug}?page=&pageSize=` */
export const GET = publicGet<Context>(
  'api.v1.sources.get',
  { scope: 'api_v1_sources', limit: 120, windowSeconds: 60 },
  async (request, context) => {
    const { slug } = await context.params;

    const { page, pageSize } = readPagination(new URL(request.url));

    const result = await getPublicSourceWithEntries(getPrismaClient(), {
      slug,
      page,
      pageSize,
    });
    if (!result) return notFound('Source not found');

    return json({
      source: serializeSource(result.source),
      items: result.items.map(serializeEntryListItem),
      meta: pageMeta({ page, pageSize, total: result.total }),
      license: LICENSE,
    });
  },
);
