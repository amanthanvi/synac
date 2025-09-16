import type { Source } from './citation';

/**
 * Remove HTML tags and normalize whitespace/control chars.
 * Behavior preserved from src/pages/terms/[id].astro
 */
export function stripTags(input: unknown): string {
  const s = String(input ?? '');
  // Remove HTML tags, robust against multi-character exploit
  let noTags = s;
  let previous;
  do {
    previous = noTags;
    noTags = noTags.replace(/<[^>]*>/g, '');
  } while (noTags !== previous);
  // Normalize whitespace/control chars
  return noTags
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Truncate to max chars with ellipsis (when needed).
 * Behavior preserved from src/pages/terms/[id].astro
 */
export function truncate(input: string, max = 120): string {
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
}

/**
 * Build ARIA label text for the "Copy citation" button.
 * Behavior preserved from src/pages/terms/[id].astro (PR #66).
 */
export function buildCopyAriaLabel(s: Source): string {
  const fallback = 'Copy citation';
  if (!s || typeof s !== 'object') return fallback;

  const base = s.citation ? stripTags(s.citation) : '';
  if (!base) return fallback;

  return `Copy citation for ${truncate(base, 120)}`;
}

/**
 * Extract hostname from a URL string. Returns '' on failure.
 * Behavior preserved from src/pages/terms/[id].astro (PR #66).
 */
export function hostFromURL(url: unknown): string {
  let host = '';
  try {
    host = new URL(String(url)).hostname;
  } catch {}
  return host;
}
