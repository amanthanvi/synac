import { getPrismaClient, getPublishedEntryBySlug } from '@synac/db';

import { serializeEntry } from '../../_shared/serialize';
import { json, notFound, problem, publicGet } from '../../_shared/publicRoute';

export { OPTIONS } from '../../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/v1/entries/by-slug?type=TERM&slug=phishing` */
export const GET = publicGet(
  'api.v1.entries.by_slug',
  { scope: 'api_v1_entries', limit: 120, windowSeconds: 60 },
  async (request) => {
    const url = new URL(request.url);
    const rawType = (url.searchParams.get('type') ?? 'TERM')
      .trim()
      .toUpperCase();
    const slug = (url.searchParams.get('slug') ?? '').trim().toLowerCase();

    if (rawType !== 'TERM' && rawType !== 'ACRONYM') {
      return problem(400, 'invalid_type', 'type must be TERM or ACRONYM');
    }
    if (!slug) return problem(400, 'invalid_slug', 'slug is required');

    const entry = await getPublishedEntryBySlug(getPrismaClient(), {
      entryType: rawType,
      slug,
    });
    if (!entry) return notFound('Entry not found');

    return json({ entry: serializeEntry(entry) });
  },
);
