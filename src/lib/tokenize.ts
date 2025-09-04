/**
 * Normalization and tokenization helpers shared by server (build) and client (query).
 * - Lowercase
 * - Fold punctuation
 * - Expand "/" and "-" variants into additional tokens
 * - Provide special-case expansions for common security terms
 *
 * NOTE: This file is safe for client usage (no server-only imports).
 */

function stripDiacritics(s: string): string {
  // NFKD normalize then drop combining marks
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function basicClean(s: string): string {
  return (
    stripDiacritics(s)
      .toLowerCase()
      // unify unicode dashes to "-"
      .replace(/[\u2012-\u2015\u2212]/g, '-')
      // remove most punctuation to spaces (keep "/" and "-" for later handling)
      .replace(/[!"#$%&'()*+,.:;<=>?@[\\\]^_`{|}~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Expand tokens for separators "/" and "-" into:
 * - split parts (e.g., "http/2" -> "http","2")
 * - joined composite (e.g., "http/2" -> "http2", "ssl-tls" -> "ssltls")
 */
function expandSepVariants(tok: string): string[] {
  const out = new Set<string>();
  if (!tok) return [];
  out.add(tok);

  if (tok.includes('/')) {
    const parts = tok.split('/').filter(Boolean);
    for (const p of parts) out.add(p);
    out.add(tok.replace(/\//g, ''));
  }
  if (tok.includes('-')) {
    const parts = tok.split('-').filter(Boolean);
    for (const p of parts) out.add(p);
    out.add(tok.replace(/-/g, ''));
  }

  // Special-case expansions
  const hyphensToSpace = tok.replace(/-/g, ' ');
  // Match variants of "denial of service" (case-insensitive, with/without hyphens, abbreviation)
  if (
    /^denial[\s-]?of[\s-]?service$/i.test(tok) ||
    /^denial[\s-]?of[\s-]?service$/i.test(hyphensToSpace) ||
    /^dos$/i.test(tok)
  ) {
    out.add('dos');
  }
  if (tok === 'http/2' || hyphensToSpace === 'http 2' || tok === 'http2') {
    out.add('http2');
  }

  return Array.from(out);
}

/**
 * Normalize an input string into a set of tokens with separator variants.
 */
export function normalizeTokens(input: string): string[] {
  const cleaned = basicClean(input);
  if (!cleaned) return [];
  const raw = cleaned
    // keep "/" and "-" for variant expansion, but split on spaces
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (const tok of raw) {
    for (const v of expandSepVariants(tok)) {
      if (v.length >= 1) out.add(v);
    }
  }
  return Array.from(out);
}

/**
 * Normalize a list of phrases into a unique token set.
 */
export function normalizePhrases(phrases: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const p of phrases) {
    if (!p) continue;
    for (const t of normalizeTokens(String(p))) out.add(t);
  }
  return Array.from(out);
}

/**
 * Convenience for query normalization.
 */
export function normalizeQuery(q: string): string[] {
  return normalizeTokens(q);
}
