import { describe, it, expect } from 'vitest';
import { termSchema } from '../../src/content/schema';

describe('content termSchema', () => {
  const valid = {
    id: 'xss',
    term: 'Cross-Site Scripting',
    acronym: ['XSS'],
    aliases: ['Cross Site Scripting'],
    summary: 'A class of injection vulnerabilities...',
    tags: ['appsec', 'web', 'cwe', 'capec'],
    sources: [
      {
        kind: 'CWE',
        citation:
          'CWE-79: Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)',
        url: 'https://cwe.mitre.org/data/definitions/79.html',
        excerpt:
          'The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page.',
        normative: true,
      },
    ],
    mappings: {
      attack: { tactic: 'Defense Evasion', techniqueIds: ['T1059'] },
      cweIds: ['CWE-79'],
      capecIds: ['CAPEC-63'],
      examDomains: ['CISSP Domain 8'],
    },
    examples: [{ heading: 'Reflected XSS', body: '...' }],
    seeAlso: ['tls'],
    oftenConfusedWith: ['csrf'],
    updatedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
  };

  it('accepts a valid term object', () => {
    const res = termSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe('xss');
      expect(res.data.sources[0].kind).toBe('CWE');
    }
  });

  it('rejects invalid URL in sources', () => {
    const bad = {
      ...valid,
      sources: [{ ...valid.sources[0], url: 'not-a-url' }],
    };
    const res = termSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it('rejects non-ISO updatedAt', () => {
    const bad = { ...valid, updatedAt: 'yesterday' as unknown as string };
    const res = termSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });
});
