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
export function compactSearchDocument(parts: Array<string | null | undefined>): string {
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
