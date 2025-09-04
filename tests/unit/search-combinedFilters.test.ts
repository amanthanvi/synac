import { describe, it, expect } from 'vitest';
import MiniSearch from 'minisearch';
import { buildIndexPayload, type SearchDoc } from '../../src/lib/searchBuild';
import { applyFacetFilters } from '../../src/lib/facetFilter';

describe('search: combined facet filters', () => {
  it('query "token" + source=RFC + type ∈ {concept,identity} yields JWT/JWS/JWE subset; removing source keeps set stable (no TLS)', () => {
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
        // stored in payload storeFields (test-only field)
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
        typeCategory: 'vulnerability',
      },
    ];

    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    const raw = mini.search('token', payload.options.searchOptions);
    const filtered = applyFacetFilters(raw as any, {
      sources: ['RFC'],
      types: ['concept', 'identity'],
    });
    const ids = filtered.map((r: any) => r.id);

    // Expect only JWT/JWS/JWE in deterministic order by score then id
    expect(ids).toEqual(expect.arrayContaining(['jwt', 'jws', 'jwe']));
    expect(ids).not.toContain('tls');
    expect(ids).not.toContain('xss');

    // Removing source=RFC alone should not introduce TLS (type=protocol) for query "token"
    const broader = applyFacetFilters(raw as any, { types: ['concept', 'identity'] });
    const broaderIds = broader.map((r: any) => r.id);
    expect(broaderIds).toEqual(expect.arrayContaining(['jwt', 'jws', 'jwe']));
    expect(broaderIds).not.toContain('tls');
  });
});
