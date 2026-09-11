import { readEntryPage, readResolvedSlug } from '@/lib/convex';
import { entryPath } from '@/lib/publicEntryPage';
import { parseEntryTypeParam } from '@/lib/searchQuery';

import {
  entryUrl,
  errorResponse,
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  parseSlug,
  serializeEntry,
} from '../../_shared';

export const runtime = 'nodejs';

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'entries.by-slug', async (url) => {
    const entryType = parseEntryTypeParam(url.searchParams.get('type'));
    if (!entryType) return errorResponse(request, 400, 'invalid_type');
    const slug = parseSlug(url.searchParams.get('slug'));
    if (!slug) return errorResponse(request, 400, 'invalid_slug');

    const resolved = await readResolvedSlug(entryType, slug);
    if (!resolved) return errorResponse(request, 404, 'not_found');
    const page = await readEntryPage(
      resolved.entryType,
      resolved.canonicalSlug,
    );
    if (!page) return errorResponse(request, 404, 'not_found');

    return jsonResponse(request, {
      canonicalUrl: entryUrl(resolved.entryType, resolved.canonicalSlug),
      canonicalSlug: resolved.needsRedirect
        ? resolved.canonicalSlug
        : undefined,
      entry: serializeEntry(page.entry),
      relationships: page.relationships.map((relation) => ({
        type: relation.type,
        entryType: relation.entry.entryType,
        slug: relation.entry.slug,
        title: relation.entry.title,
        summary: relation.entry.summaryText,
        url: entryPath(relation.entry.entryType, relation.entry.slug),
      })),
    });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
