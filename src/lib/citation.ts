import type { TermEntry } from '../types/term';

export type Source = TermEntry['sources'][number];

function normalizeType(source: Source): 'Normative' | 'Informative' {
  return source && !!source.normative ? 'Normative' : 'Informative';
}

function sanitize(val: unknown): string {
  // Normalize to plain text, collapse whitespace, strip control chars
  let s = String(val ?? '');
  // Replace newlines and tabs with a space
  s = s.replace(/[\r\n\t]+/g, ' ');
  // Replace remaining ASCII control characters with a space (avoid word-joins), then collapse
  s = s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

export function buildCitation(source: Source): string {
  const label = sanitize(source.citation);
  const url = sanitize(source.url);
  const type = normalizeType(source);
  return `${label} — ${url} (${type})`;
}

export function buildCitations(sources: Source[] = []): string {
  const safe = Array.isArray(sources) ? sources : [];
  return safe.map((s) => buildCitation(s)).join('\n');
}

export const citation = {
  buildCitation,
  buildCitations,
};
