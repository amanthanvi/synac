import type { TermEntry } from '../types/term';

export type Source = TermEntry['sources'][number];

function normalizeType(source: Source): 'Normative' | 'Informative' {
  return source && !!source.normative ? 'Normative' : 'Informative';
}

function sanitize(val: unknown): string {
  return String(val ?? '')
    .replace(/\r?\n+/g, ' ')
    .trim();
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
