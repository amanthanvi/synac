import { senseAnchorId } from '@synac/shared';

import { readEntryPage, readResolvedSlug } from '@/lib/convex';
import { parseEntryTypeParam } from '@/lib/searchQuery';

import {
  entryUrl,
  errorResponse,
  handleReadRequest,
  jsonResponse,
  optionsResponse,
  parseSlug,
  senseHeading,
  serializeAttestation,
  serializeCitation,
} from '../../_shared';

export const runtime = 'nodejs';

const MAX_SENSE_KEY_LENGTH = 200;

/**
 * Sense keys carry source prefixes and raw source labels, so they are matched
 * literally against the entry's own senses rather than pattern-checked.
 */
function parseSenseKey(value: string | null): string | null {
  const key = (value ?? '').trim();
  if (!key || key.length > MAX_SENSE_KEY_LENGTH) return null;
  return key;
}

export function GET(request: Request): Promise<Response> {
  return handleReadRequest(request, 'senses.citation', async (url) => {
    const entryType = parseEntryTypeParam(url.searchParams.get('type'));
    if (!entryType) return errorResponse(request, 400, 'invalid_type');
    const slug = parseSlug(url.searchParams.get('slug'));
    if (!slug) return errorResponse(request, 400, 'invalid_slug');
    const senseKey = parseSenseKey(url.searchParams.get('sense'));
    if (!senseKey) return errorResponse(request, 400, 'invalid_sense');

    const resolved = await readResolvedSlug(entryType, slug);
    if (!resolved) return errorResponse(request, 404, 'not_found');
    const page = await readEntryPage(
      resolved.entryType,
      resolved.canonicalSlug,
    );
    if (!page) return errorResponse(request, 404, 'not_found');

    const sense = page.entry.senses.find((item) => item.key === senseKey);
    if (!sense) return errorResponse(request, 404, 'not_found');

    const anchor = senseAnchorId(sense.key);
    const primary = sense.citations[0];

    return jsonResponse(request, {
      entryType: page.entry.entryType,
      slug: page.entry.slug,
      entryTitle: page.entry.title,
      senseKey: sense.key,
      senseHeading: senseHeading(sense, page.entry.entryType),
      anchor,
      canonicalUrl: `${entryUrl(page.entry.entryType, page.entry.slug)}#${anchor}`,
      primaryCitation: primary ? serializeCitation(primary) : null,
      attestations: sense.attestations.map(serializeAttestation),
    });
  });
}

export function OPTIONS(): Response {
  return optionsResponse();
}
