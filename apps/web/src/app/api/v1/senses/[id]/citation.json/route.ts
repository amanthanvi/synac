import { getPrismaClient, getSenseCitationRecord } from '@synac/db';

import {
  isUuid,
  json,
  notFound,
  publicGet,
} from '../../../_shared/publicRoute';
import { serializeSenseCitationRecord } from '../../../_shared/serialize';

export { OPTIONS } from '../../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * `GET /api/v1/senses/{id}/citation.json`
 *
 * The provenance record for one meaning: every source that attests it, the
 * exact document and content hash the wording came from, and the locator within
 * that document. This is what makes a definition checkable rather than merely
 * cited.
 */
export const GET = publicGet<Context>(
  'api.v1.senses.citation',
  { scope: 'api_v1_senses', limit: 120, windowSeconds: 60 },
  async (_request, context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return notFound('Sense not found');

    const record = await getSenseCitationRecord(getPrismaClient(), {
      senseId: id.trim(),
    });
    if (!record) return notFound('Sense not found');

    return json(serializeSenseCitationRecord(record));
  },
);
