import type { BundleFile } from '@synac/content-tools';

import type { SafeFetchResult } from './safeFetch.js';

type BundleDocument = BundleFile['documents'][number];
type BundleEntry = BundleFile['entries'][number];

/**
 * Validators for a conditional GET of `url`, taken from the previous bundle's
 * record of that same URL. They are withheld when the previous bundle came from
 * a different adapter version, because a version bump has to reparse the source
 * even when the bytes upstream are unchanged.
 */
export function conditionalHeaders(
  previous: BundleFile | null,
  url: string,
  adapterVersion: string,
): Record<string, string> {
  if (!previous || previous.adapterVersion !== adapterVersion) return {};
  const document = previous.documents.find((doc) => doc.url === url);
  if (!document) return {};

  const headers: Record<string, string> = {};
  if (document.etag) headers['if-none-match'] = document.etag;
  if (document.lastModified)
    headers['if-modified-since'] = document.lastModified;
  return headers;
}

/** Validators to record on the document this fetch produced, for the next run. */
export function documentValidators(
  result: Pick<SafeFetchResult, 'etag' | 'lastModified'>,
): { etag?: string; lastModified?: string } {
  const validators: { etag?: string; lastModified?: string } = {};
  if (result.etag) validators.etag = result.etag;
  if (result.lastModified) validators.lastModified = result.lastModified;
  return validators;
}

/**
 * What a 304 for `url` lets this run reuse: the previous bundle's document for
 * that URL and the entries whose senses cite it. Entries drop `updatedAt` so
 * `finalizeBundle` re-derives it, which keeps an unchanged entry's date stable.
 */
export function reusePreviousDocument(
  previous: BundleFile | null,
  url: string,
):
  | { document: BundleDocument; entries: Array<Omit<BundleEntry, 'updatedAt'>> }
  | undefined {
  if (!previous) return undefined;
  const document = previous.documents.find((doc) => doc.url === url);
  if (!document) return undefined;

  const entries = previous.entries.flatMap(
    ({ updatedAt: _updatedAt, ...draft }) =>
      draft.senses.some((sense) => sense.citation.documentKey === document.key)
        ? [draft]
        : [],
  );
  return { document, entries };
}
