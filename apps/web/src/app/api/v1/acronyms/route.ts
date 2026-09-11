import { browseEntries } from '../_shared/browse';
import { publicGet } from '../_shared/publicRoute';

export { OPTIONS } from '../_shared/publicRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/v1/acronyms?letter=&page=&pageSize=&sort=&tag=&q=` */
export const GET = publicGet(
  'api.v1.acronyms',
  { scope: 'api_v1_browse', limit: 120, windowSeconds: 60 },
  async (request) => browseEntries(request, 'ACRONYM'),
);
