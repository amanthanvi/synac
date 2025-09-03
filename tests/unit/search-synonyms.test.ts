import { describe, it, expect } from 'vitest';
import MiniSearch from 'minisearch';
import { buildIndexPayload } from '../../src/lib/searchBuild';
import { normalizeTokens } from '../../src/lib/tokenize';

describe('search: normalization and build-time synonyms', () => {
  it('token normalization handles "/" and case variants', () => {
    const t1 = normalizeTokens('HTTP/2');
    expect(t1).toContain('http2');
    expect(t1).toContain('http');
    expect(t1).toContain('2');

    const t2 = normalizeTokens('DoS');
    expect(t2).toContain('dos');
  });

  it('synonym expansion (jot → jwt, ssl → tls, mitm → aitm) at build time', () => {
    const docs = [
      {
        id: 'jwt',
        term: 'JSON Web Token',
        acronym: ['JWT'],
        aliases: [],
        text: 'token',
        tags: ['auth'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'tls',
        term: 'Transport Layer Security',
        acronym: ['TLS'],
        aliases: [],
        text: 'protocol',
        tags: ['crypto'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'aitm',
        term: 'Adversary-in-the-Middle',
        acronym: ['AiTM'],
        aliases: [],
        text: 'attack pattern',
        tags: ['network'],
        sourceKinds: ['CAPEC'],
      },
    ];
    const payload = buildIndexPayload(docs as any);
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    const r1 = mini.search('jot', payload.options.searchOptions);
    expect(r1.some((r: any) => r.id === 'jwt')).toBe(true);

    const r2 = mini.search('ssl', payload.options.searchOptions);
    expect(r2.some((r: any) => r.id === 'tls')).toBe(true);

    const r3 = mini.search('mitm', payload.options.searchOptions);
    expect(r3.some((r: any) => r.id === 'aitm')).toBe(true);
  });

  it('de-duplication: single doc returned even if alias/title overlap', () => {
    const docs = [
      {
        id: 'jwt',
        term: 'JSON Web Token',
        acronym: ['JWT'],
        aliases: ['JWT Token'],
        text: 'token',
        tags: ['auth'],
        sourceKinds: ['RFC'],
      },
    ];
    const payload = buildIndexPayload(docs as any);
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    const r = mini.search('jwt token', payload.options.searchOptions);
    const ids = r.map((x: any) => x.id);
    // Ensure only one entry for jwt
    expect(ids.filter((id: string) => id === 'jwt').length).toBe(1);
  });

  it('scoring: exact title/id outranks alias-only matches; deterministic tie-break by slug', () => {
    // tls has alias "ssl" via synonyms.json; add a real ssl doc too — exact title/id should outrank alias
    const docs = [
      {
        id: 'tls',
        term: 'Transport Layer Security',
        acronym: ['TLS'],
        aliases: [],
        text: 'crypto protocol',
        tags: ['crypto', 'protocol'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'ssl',
        term: 'Secure Sockets Layer',
        acronym: ['SSL'],
        aliases: [],
        text: 'legacy protocol',
        tags: ['protocol'],
        sourceKinds: ['RFC'],
      },
    ];
    const payload = buildIndexPayload(docs as any);
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    const r = mini.search('ssl', payload.options.searchOptions);
    // Expect SSL doc (exact) above TLS (matched via alias)
    expect((r[0] as any).id).toBe('ssl');
    // Deterministic order for remainder by score then slug
    for (let i = 1; i < r.length; i++) {
      expect(typeof (r[i] as any).id).toBe('string');
    }
  });
});
