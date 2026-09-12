import { browseResponse } from '../_browse';
import { optionsResponse } from '../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return browseResponse(request, 'TERM', 'terms');
}

export function OPTIONS(): Response {
  return optionsResponse();
}
