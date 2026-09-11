import { getPrismaClient, getPublishedEntryById } from '@synac/db';

import { serializeEntry } from '../../_shared/serialize';
import { isUuid, json, notFound, publicGet } from '../../_shared/publicRoute';

export { OPTIONS } from '../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** `GET /api/v1/entries/{id}` */
export const GET = publicGet<Context>(
  'api.v1.entries.get',
  { scope: 'api_v1_entries', limit: 120, windowSeconds: 60 },
  async (_request, context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return notFound('Entry not found');

    const entry = await getPublishedEntryById(getPrismaClient(), {
      id: id.trim(),
    });
    if (!entry) return notFound('Entry not found');

    return json({ entry: serializeEntry(entry) });
  },
);
