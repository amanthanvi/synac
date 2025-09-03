import { describe, it, expect } from 'vitest';
import MiniSearch from 'minisearch';
import { buildIndexPayload, type SearchDoc } from '../../src/lib/searchBuild';
import { searchOptions } from '../../src/lib/searchOptions';

function applyFacetFilters(
  results: any[],
  opts: { sources?: string[]; types?: string[]; tags?: string[] },
) {
  const srcSel = opts.sources || [];
  const typeSel = opts.types || [];
  const tagSel = opts.tags || [];

  const filtered = results.filter((r: any) => {
    if (srcSel.length) {
      const kinds: string[] = Array.isArray(r.sourceKinds) ? r.sourceKinds : [];
      for (const s of srcSel) if (!kinds.includes(s)) return false;
    }
    if (typeSel.length) {
      const t = String(r.typeCategory || '');
      if (!typeSel.includes(t)) return false;
    }
    if (tagSel.length) {
      const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
      for (const t of tagSel) if (!tags.includes(t)) return false;
    }
    return true;
  });

  filtered.sort((a: any, b: any) => {
    const sa = typeof a.score === 'number' ? a.score : 0;
    const sb = typeof b.score === 'number' ? b.score : 0;
    if (sb !== sa) return sb - sa;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return filtered;
}

describe('search: combined facet filters', () => {
  it('query "token" + source=RFC + type ∈ {concept,identity} yields JWT/JWS/JWE subset', () => {
    const docs: SearchDoc[] = [
      // JOSE family (RFC + token-related)
      {
        id: 'jwt',
        term: 'JSON Web Token',
        acronym: ['JWT'],
        aliases: ['jwt token'],
        text: 'token rfc claims',
        tags: ['auth', 'tokens', 'rfc'],
        sourceKinds: ['RFC'],
        // keep consistent with our heuristic (identity)
        // @ts-ignore stored by MiniSearch via storeFields
        typeCategory: 'identity',
      },
      {
        id: 'jws',
        term: 'JSON Web Signature',
        acronym: ['JWS'],
        aliases: [],
        text: 'token signature rfc',
        tags: ['tokens', 'rfc'],
        sourceKinds: ['RFC'],
        // @ts-ignore
        typeCategory: 'concept',
      },
      {
        id: 'jwe',
        term: 'JSON Web Encryption',
        acronym: ['JWE'],
        aliases: [],
        text: 'token encryption rfc',
        tags: ['tokens', 'rfc'],
        sourceKinds: ['RFC'],
        // @ts-ignore
        typeCategory: 'concept',
      },
      // A protocol but not a token; used to validate narrowing
      {
        id: 'tls',
        term: 'Transport Layer Security',
        acronym: ['TLS'],
        aliases: ['ssl/tls'],
        text: 'protocol cryptography',
        tags: ['crypto', 'rfc'],
        sourceKinds: ['RFC'],
        // @ts-ignore
        typeCategory: 'protocol',
      },
      // A vulnerability (non-RFC)
      {
        id: 'xss',
        term: 'Cross-Site Scripting',
        acronym: ['XSS'],
        aliases: ['cross site scripting'],
        text: 'web vulnerability cwe capec',
        tags: ['web', 'cwe', 'capec'],
        sourceKinds: ['CWE', 'CAPEC'],
        // @ts-ignore
        typeCategory: 'vulnerability',
      },
    ];

    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    const raw = mini.search('token', searchOptions.searchOptions);
    const filtered = applyFacetFilters(raw as any, {
      sources: ['RFC'],
      types: ['concept', 'identity'],
    });
    const ids = filtered.map((r: any) => r.id);

    // Expect only JWT/JWS/JWE in deterministic order by score then id
    expect(ids).toEqual(expect.arrayContaining(['jwt', 'jws', 'jwe']));
    expect(ids).not.toContain('tls');
    expect(ids).not.toContain('xss');

    // Removing source=RFC alone does not include TLS (type=protocol) for query "token"; set remains stable
    const broader = applyFacetFilters(raw as any, { types: ['concept', 'identity'] });
    const broaderIds = broader.map((r: any) => r.id);
    expect(broaderIds).toEqual(expect.arrayContaining(['jwt', 'jws', 'jwe']));
    expect(broaderIds).not.toContain('tls');
  });
});
