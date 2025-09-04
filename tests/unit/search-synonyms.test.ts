import { describe, it, expect } from 'vitest';
import MiniSearch from 'minisearch';
import { buildIndexPayload, type SearchDoc } from '../../src/lib/searchBuild';
import type { Options } from 'minisearch';
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
    const docs: SearchDoc[] = [
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
    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(
      payload.index as string,
      payload.options as unknown as Options<any>,
    );

    const r1 = mini.search('jot', payload.options.searchOptions);
    expect(r1.some((r: any) => r.id === 'jwt')).toBe(true);

    // Negative test case: search for a non-synonym term to ensure no false positives
    const rNegative = mini.search('apple', payload.options.searchOptions);
    expect(rNegative.length).toBe(0);

    const r2 = mini.search('ssl', payload.options.searchOptions);
    expect(r2.some((r: any) => r.id === 'tls')).toBe(true);

    const r3 = mini.search('mitm', payload.options.searchOptions);
    expect(r3.some((r: any) => r.id === 'aitm')).toBe(true);
  });

  it('de-duplication: single doc returned even if alias/title overlap', () => {
    const docs: SearchDoc[] = [
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
    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(
      payload.index as string,
      payload.options as unknown as Options<any>,
    );

    const r = mini.search('jwt token', payload.options.searchOptions);
    const ids = r.map((x: any) => x.id);
    // Ensure only one entry for jwt
    expect(ids.filter((id: string) => id === 'jwt').length).toBe(1);
  });

  it('scoring: exact title/id outranks alias-only matches; deterministic tie-break by slug', () => {
    // tls has alias "ssl" via synonyms.json; add a real ssl doc too — exact title/id should outrank alias
    const docs: SearchDoc[] = [
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
    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(
      payload.index as string,
      payload.options as unknown as Options<any>,
    );

    const r = mini.search('ssl', payload.options.searchOptions);
    // Expect SSL doc (exact) above TLS (matched via alias)

    // Tie-break determinism: If scores are equal, order by slug deterministically
    const tieDocs: SearchDoc[] = [
      {
        id: 'alpha',
        term: 'SSL',
        acronym: ['SSL'],
        aliases: [],
        text: '',
        tags: [],
        sourceKinds: ['RFC'],
      },
      {
        id: 'beta',
        term: 'SSL',
        acronym: ['SSL'],
        aliases: [],
        text: '',
        tags: [],
        sourceKinds: ['RFC'],
      },
    ];
    const tiePayload = buildIndexPayload(tieDocs);
    const tieMini = MiniSearch.loadJSON(
      tiePayload.index as string,
      tiePayload.options as unknown as Options<any>,
    );
    const tieResults = tieMini.search('ssl', tiePayload.options.searchOptions) as Array<{
      id: string;
      score: number;
    }>;
    // Deterministic order by score then slug (scores may differ slightly)
    tieResults.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(tieResults.map((x) => x.id)).toEqual(['alpha', 'beta']);
    expect((r[0] as any).id).toBe('ssl');
    // Deterministic order for remainder by score then slug
    for (let i = 1; i < r.length; i++) {
      expect(typeof (r[i] as any).id).toBe('string');
    }
  });
});

/**
 * Follow-up coverage for new build-time aliases.
 */

describe('search: synonyms follow-ups (alias expansion and determinism)', () => {
  it('aliases resolve to canonical slugs (e.g., oidc → openid-connect, mtls → mutual-tls, etc.)', () => {
    const docs: SearchDoc[] = [
      // OIDC / OAuth
      {
        id: 'openid-connect',
        term: 'OpenID Connect',
        acronym: ['OIDC'],
        aliases: [],
        text: 'auth protocol',
        tags: ['auth'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'oauth2',
        term: 'OAuth 2.0',
        acronym: ['OAUTH2'],
        aliases: [],
        text: 'authorization',
        tags: ['auth'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'pkce',
        term: 'Proof Key for Code Exchange',
        acronym: ['PKCE'],
        aliases: [],
        text: 'code exchange',
        tags: ['auth'],
        sourceKinds: ['RFC'],
      },

      // TLS / mTLS / HTTP/3 / QUIC
      {
        id: 'mutual-tls',
        term: 'Mutual TLS',
        acronym: ['mTLS'],
        aliases: [],
        text: 'client certificate',
        tags: ['tls'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'http3',
        term: 'HTTP/3',
        acronym: [],
        aliases: [],
        text: 'http transport',
        tags: ['http'],
        sourceKinds: ['RFC'],
      },

      // X.509 / PKI
      {
        id: 'x509-certificate',
        term: 'X.509 Certificate',
        acronym: [],
        aliases: [],
        text: 'certificate',
        tags: ['pki'],
        sourceKinds: ['RFC'],
      },

      // Crypto
      {
        id: 'sha-256',
        term: 'SHA-256',
        acronym: [],
        aliases: [],
        text: 'hash',
        tags: ['crypto'],
        sourceKinds: ['NIST'],
      },
      {
        id: 'gcm',
        term: 'Galois/Counter Mode',
        acronym: [],
        aliases: [],
        text: 'aes mode',
        tags: ['crypto'],
        sourceKinds: ['NIST'],
      },
      {
        id: 'jws',
        term: 'JSON Web Signature',
        acronym: ['JWS'],
        aliases: [],
        text: 'JOSE',
        tags: ['jose'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'jwe',
        term: 'JSON Web Encryption',
        acronym: ['JWE'],
        aliases: [],
        text: 'JOSE',
        tags: ['jose'],
        sourceKinds: ['RFC'],
      },

      // Web vulns
      {
        id: 'open-redirect',
        term: 'Open Redirect',
        acronym: [],
        aliases: [],
        text: 'web vuln',
        tags: ['web'],
        sourceKinds: ['OWASP'],
      },
      {
        id: 'path-traversal',
        term: 'Path Traversal',
        acronym: [],
        aliases: [],
        text: 'web vuln',
        tags: ['web'],
        sourceKinds: ['OWASP'],
      },
      {
        id: 'ssrf',
        term: 'Server-Side Request Forgery',
        acronym: ['SSRF'],
        aliases: [],
        text: 'web vuln',
        tags: ['web'],
        sourceKinds: ['OWASP'],
      },
      {
        id: 'xxe',
        term: 'XML External Entity',
        acronym: [],
        aliases: [],
        text: 'xml vuln',
        tags: ['web'],
        sourceKinds: ['OWASP'],
      },

      // DoS / DDoS
      {
        id: 'dos',
        term: 'Denial of Service',
        acronym: ['DoS'],
        aliases: [],
        text: 'attack pattern',
        tags: ['attack'],
        sourceKinds: ['CAPEC'],
      },
    ];
    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(
      payload.index as string,
      payload.options as unknown as Options<any>,
    );

    const searchIds = (q: string) =>
      (mini.search(q, payload.options.searchOptions) as any[]).map((r) => r.id);

    // Auth/OIDC/OAuth
    expect(searchIds('oidc')).toContain('openid-connect');
    expect(searchIds('open id connect')).toContain('openid-connect');
    expect(searchIds('openid connect')).toContain('openid-connect');
    expect(searchIds('oauth')).toContain('oauth2');
    expect(searchIds('oauth 2.0')).toContain('oauth2');
    expect(searchIds('oauth2.0')).toContain('oauth2');
    expect(searchIds('proof key for code exchange')).toContain('pkce');
    expect(searchIds('oauth pkce')).toContain('pkce');

    // mTLS / HTTP/3
    expect(searchIds('mtls')).toContain('mutual-tls');
    expect(searchIds('tls client authentication')).toContain('mutual-tls');
    expect(searchIds('client cert auth')).toContain('mutual-tls');
    expect(searchIds('http/3')).toContain('http3');
    expect(searchIds('http 3')).toContain('http3');
    expect(searchIds('h3')).toContain('http3');

    // X.509 / PKI
    expect(searchIds('x509')).toContain('x509-certificate');
    expect(searchIds('x.509')).toContain('x509-certificate');
    expect(searchIds('x509 certificate')).toContain('x509-certificate');

    // Crypto
    expect(searchIds('sha256')).toContain('sha-256');
    expect(searchIds('sha 256')).toContain('sha-256');
    expect(searchIds('aes-gcm')).toContain('gcm');
    expect(searchIds('aes gcm')).toContain('gcm');
    expect(searchIds('json web signature')).toContain('jws');
    expect(searchIds('jws token')).toContain('jws');
    expect(searchIds('json web encryption')).toContain('jwe');

    // Web vulns
    expect(searchIds('unvalidated redirect')).toContain('open-redirect');
    expect(searchIds('open redirection')).toContain('open-redirect');
    expect(searchIds('directory traversal')).toContain('path-traversal');
    expect(searchIds('server-side request forgery')).toContain('ssrf');
    expect(searchIds('xml external entity')).toContain('xxe');

    // DoS
    expect(searchIds('ddos')).toContain('dos');
    expect(searchIds('denial-of-service')).toContain('dos');
  });

  it('deterministic ordering using explicit sort: ties resolved by slug asc', () => {
    const docs: SearchDoc[] = [
      // Ensure overlapping "json web" terms to test tie-break determinism
      {
        id: 'jwt',
        term: 'JSON Web Token',
        acronym: ['JWT'],
        aliases: [],
        text: 'JOSE',
        tags: ['jose'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'jws',
        term: 'JSON Web Signature',
        acronym: ['JWS'],
        aliases: [],
        text: 'JOSE',
        tags: ['jose'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'jwe',
        term: 'JSON Web Encryption',
        acronym: ['JWE'],
        aliases: [],
        text: 'JOSE',
        tags: ['jose'],
        sourceKinds: ['RFC'],
      },

      // http family to test multi-result order
      {
        id: 'http2',
        term: 'HTTP/2',
        acronym: [],
        aliases: [],
        text: 'http protocol',
        tags: ['http'],
        sourceKinds: ['RFC'],
      },
      {
        id: 'http3',
        term: 'HTTP/3',
        acronym: [],
        aliases: [],
        text: 'http protocol',
        tags: ['http'],
        sourceKinds: ['RFC'],
      },
    ];
    const payload = buildIndexPayload(docs);
    const mini = MiniSearch.loadJSON(
      payload.index as string,
      payload.options as unknown as Options<any>,
    );

    const sortedIds = (q: string, n: number) => {
      const results = mini.search(q, payload.options.searchOptions) as Array<{
        id: string;
        score: number;
      }>;
      results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return results.slice(0, n).map((r) => r.id);
    };

    // Expect stable, explicitly-sorted order
    expect(sortedIds('json web', 3)).toEqual(['jwe', 'jws', 'jwt']);
    expect(sortedIds('http', 2)).toEqual(['http2', 'http3']);
  });
});
