import { describe, it, expect } from 'vitest';
import { deriveSourceKinds, deriveTypeCategory } from '../../src/lib/facets';

describe('search: facet derivation', () => {
  it('JWT (RFC) → sourceKinds includes RFC; typeCategory identity (heuristic)', () => {
    const jwt = {
      term: 'JSON Web Token (JWT)',
      tags: ['auth', 'tokens', 'rfc'],
      sources: [
        {
          kind: 'RFC',
          citation: 'RFC 7519',
          url: 'https://www.rfc-editor.org/rfc/rfc7519',
          normative: true,
        },
      ],
      mappings: {},
    };
    const kinds = deriveSourceKinds(jwt);
    expect(kinds).toContain('RFC');
    const type = deriveTypeCategory(jwt.term, jwt.tags, jwt.mappings);
    expect(type).toBe('identity'); // consistent heuristic choice
  });

  it('XSS (CWE+CAPEC) → kinds include CWE and CAPEC; typeCategory vulnerability', () => {
    const xss = {
      term: 'Cross-Site Scripting',
      tags: ['appsec', 'web', 'cwe', 'capec'],
      sources: [
        {
          kind: 'CWE',
          citation: 'CWE-79',
          url: 'https://cwe.mitre.org/data/definitions/79.html',
          normative: true,
        },
        {
          kind: 'CAPEC',
          citation: 'CAPEC-63',
          url: 'https://capec.mitre.org/data/definitions/63.html',
          normative: true,
        },
      ],
      mappings: { cweIds: ['CWE-79'], capecIds: ['CAPEC-63'] },
    };
    const kinds = deriveSourceKinds(xss);
    expect(kinds).toEqual(expect.arrayContaining(['CWE', 'CAPEC']));
    const type = deriveTypeCategory(xss.term, xss.tags, xss.mappings);
    expect(type).toBe('vulnerability');
  });

  it('AiTM (CAPEC) → kinds include CAPEC; typeCategory attack-pattern', () => {
    const aitm = {
      term: 'Adversary-in-the-Middle',
      tags: ['network', 'capec'],
      sources: [
        {
          kind: 'CAPEC',
          citation: 'CAPEC-94',
          url: 'https://capec.mitre.org/data/definitions/94.html',
          normative: true,
        },
      ],
      mappings: { capecIds: ['CAPEC-94'] },
    };
    const kinds = deriveSourceKinds(aitm);
    expect(kinds).toEqual(expect.arrayContaining(['CAPEC']));
    const type = deriveTypeCategory(aitm.term, aitm.tags, aitm.mappings);
    expect(type).toBe('attack-pattern');
  });

  it('TLS (RFC) → typeCategory protocol', () => {
    const tls = {
      term: 'Transport Layer Security',
      tags: ['crypto', 'network', 'rfc', 'protocol'],
      sources: [
        {
          kind: 'RFC',
          citation: 'RFC 8446',
          url: 'https://www.rfc-editor.org/rfc/rfc8446',
          normative: true,
        },
      ],
      mappings: {},
    };
    const kinds = deriveSourceKinds(tls);
    expect(kinds).toContain('RFC');
    const type = deriveTypeCategory(tls.term, tls.tags, tls.mappings);
    expect(type).toBe('protocol');
  });
});
