// Internal helpers shared by the entry-level and sense-level search pipelines.
// Deliberately not re-exported from `src/index.ts`.

/** Matches canonical UUID strings, the only ids ever interpolated as `::uuid`. */
const UUID_STRING_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_STRING_RE.test(value.trim());
}

/** Stopwords that match nearly every document, so searching them is noise. */
export const IGNORED_QUERIES = new Set(['a', 'an', 'and', 'or', 'the']);
