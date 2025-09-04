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
// Configurable special-case expansions (regex -> canonical token)
const SPECIAL_EQUIVS: Array<[RegExp, string]> = [
  [/^denial[\s-]?of[\s-]?service$/i, 'dos'],
  [/^dos$/i, 'dos'],
  [/^(?:http\/?2|http 2|http2)$/i, 'http2'],
];

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

  // Special-case expansions via configurable rules
  const hyphensToSpace = tok.replace(/-/g, ' ');
  for (const [re, canonical] of SPECIAL_EQUIVS) {
    if (re.test(tok) || re.test(hyphensToSpace)) {
      out.add(canonical);
    }
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
