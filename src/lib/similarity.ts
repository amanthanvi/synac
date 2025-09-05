import { MIN_TOKEN_LENGTH } from './constants';

/**
 * Tokenize a string into a normalized set of tokens with a minimum length.
 */
export function tokenize(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t && t.length >= MIN_TOKEN_LENGTH),
  );
}

/**
 * Jaccard similarity between two token sets.
 * Note: If both sets are empty, returns 0 (matches previous behavior).
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/**
 * Compute the minimum pairwise Jaccard similarity across all provided texts.
 */
export function computeMinSimilarity(texts: string[]): number {
  const sets = texts.map(tokenize);
  let min = 1;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const s = jaccard(sets[i], sets[j]);
      if (s < min) min = s;
    }
  }
  return min;
}
