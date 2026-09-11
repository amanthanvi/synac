import {
  getPrismaClient,
  getPublicTagBySlug,
  listPublishedEntries,
} from '@synac/db';

import {
  json,
  notFound,
  problem,
  publicGet,
  readEntryType,
  readPagination,
} from '../../../_shared/publicRoute';
import {
  LICENSE,
  pageMeta,
  serializeEntryListItem,
} from '../../../_shared/serialize';

export { OPTIONS } from '../../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/** `GET /api/v1/tags/{slug}/entries?page=&pageSize=&type=` */
export const GET = publicGet<Context>(
  'api.v1.tags.entries',
  { scope: 'api_v1_tags', limit: 120, windowSeconds: 60 },
  async (request, context) => {
    const { slug } = await context.params;
    const prisma = getPrismaClient();

    const tag = await getPublicTagBySlug(prisma, { slug });
    if (!tag) return notFound('Tag not found');

    const url = new URL(request.url);
    const { page, pageSize } = readPagination(url);

    const entryType = readEntryType(url);
    if (entryType === null) {
      return problem(400, 'invalid_type', 'type must be TERM or ACRONYM');
    }

    const listInput: Parameters<typeof listPublishedEntries>[1] = {
      tagSlug: tag.slug,
      sort: 'title',
      page,
      pageSize,
    };
    if (entryType) listInput.entryType = entryType;

    const { items, total } = await listPublishedEntries(prisma, listInput);

    return json({
      tag: {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        description: tag.description,
        kind: tag.kind,
        parentId: tag.parentId,
        url: `/tags/${tag.slug}`,
      },
      items: items.map(serializeEntryListItem),
      meta: pageMeta({ page, pageSize, total }),
      license: LICENSE,
    });
  },
);
