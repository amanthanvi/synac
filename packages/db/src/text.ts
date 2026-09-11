/**
 * Text normalisation shared by the web app, the worker, and the db package
 * itself. It lives here because `packages/db` must not import from `apps/*`,
 * and both apps already depend on `@synac/db`.
 */

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

/** Trims and collapses `value`, refusing an empty result by label. */
export function requireNonEmpty(label: string, value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
