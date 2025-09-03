/**
 * Facet derivation helpers shared at build time.
 * Keep heuristics minimal and deterministic.
 */

export type SourceKind = 'NIST' | 'ATTACK' | 'CWE' | 'CAPEC' | 'RFC' | 'OTHER';

export function deriveSourceKinds(data: any): SourceKind[] {
  const kinds = new Set<SourceKind>();

  // From explicit sources.kind
  const sources: Array<any> = Array.isArray(data?.sources) ? data.sources : [];
  for (const s of sources) {
    const k = String(s?.kind || '').toUpperCase();
    if (k === 'NIST' || k === 'ATTACK' || k === 'CWE' || k === 'CAPEC' || k === 'RFC') {
      kinds.add(k as SourceKind);
    }
    const url = String(s?.url || '');
    const citation = String(s?.citation || '');
    if (url.includes('nist.gov') || citation.toUpperCase().includes('NIST')) kinds.add('NIST');
  }

  // From mappings presence
  const mappings = data?.mappings || {};
  if (Array.isArray(mappings?.cweIds) && mappings.cweIds.length) kinds.add('CWE');
  if (Array.isArray(mappings?.capecIds) && mappings.capecIds.length) kinds.add('CAPEC');
  if (
    (mappings?.attack && (mappings.attack.tactic || (mappings.attack.techniqueIds || []).length)) ||
    // Some content may have legacy 'attack' array
    (Array.isArray(mappings?.attack) && mappings.attack.length)
  ) {
    kinds.add('ATTACK');
  }

  if (kinds.size === 0) kinds.add('OTHER');
  return Array.from(kinds);
}

function isLikelyProtocol(term: string, tags: string[]): boolean {
  if (tags.includes('protocol')) return true;
  const t = term.toLowerCase();
  // Heuristic keywords that strongly indicate a protocol or wire format
  const hints = [
    'http',
    'tls',
    'ssl',
    'udp',
    'tcp',
    'dns',
    'dnssec',
    'quic',
    'ocsp',
    'hsts',
    'http/2',
    'http2',
    'http3',
  ];
  return hints.some((h) => t.includes(h));
}

export type TypeCategory =
  | 'protocol'
  | 'vulnerability'
  | 'attack-pattern'
  | 'crypto'
  | 'identity'
  | 'concept';

export function deriveTypeCategory(term: string, tagsInput: any, mappings: any): TypeCategory {
  const tags: string[] = Array.isArray(tagsInput) ? tagsInput.map((t) => String(t)) : [];

  if (Array.isArray(mappings?.cweIds) && mappings.cweIds.length) return 'vulnerability';
  if (Array.isArray(mappings?.capecIds) && mappings.capecIds.length) return 'attack-pattern';
  if (isLikelyProtocol(term, tags)) return 'protocol';
  if (tags.includes('crypto')) return 'crypto';
  if (tags.includes('auth') || tags.includes('identity')) return 'identity';
  return 'concept';
}
