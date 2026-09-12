const MAX_ENTRY_SEARCH_DOCUMENT_CHARS = 8000;

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeTitle(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function markdownToText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deduplicated, whitespace-compacted concatenation used as the full-text search document. */
export function compactSearchDocument(
  parts: Array<string | null | undefined>,
): string {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of parts) {
    if (typeof value !== 'string') continue;
    const text = normalizeWhitespace(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values.join(' ').slice(0, MAX_ENTRY_SEARCH_DOCUMENT_CHARS);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/**
 * Dice coefficient over the two texts' word-token sets: 1.0 when they use the
 * same words, 0 when they share none. Used to decide whether two source
 * definitions describe one meaning.
 */
export function definitionSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}
