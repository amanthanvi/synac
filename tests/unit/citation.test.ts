import { describe, it, expect } from 'vitest';
import type { TermEntry } from '../../src/types/term';
import { buildCitation, buildCitations } from '../../src/lib/citation';

type Source = TermEntry['sources'][number];

describe('citation formatter', () => {
  it('formats Normative vs Informative deterministically', () => {
    const normative: Source = {
      kind: 'RFC',
      citation: ' RFC 7519 ',
      url: ' https://www.rfc-editor.org/rfc/rfc7519 ',
      normative: true,
    };
    const informative: Source = {
      kind: 'OTHER',
      citation: ' OWASP JWT Cheat Sheet ',
      url: ' https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html ',
      // normative omitted -> Informative
    };

    expect(buildCitation(normative)).toBe(
      'RFC 7519 — https://www.rfc-editor.org/rfc/rfc7519 (Normative)',
    );
    expect(buildCitation(informative)).toBe(
      'OWASP JWT Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html (Informative)',
    );
  });

  it('trims whitespace and escapes newlines to single spaces', () => {
    const withNewlines: Source = {
      kind: 'CWE',
      citation: 'CWE-79:\nImproper Neutralization\nof Input',
      url: 'https://cwe.mitre.org/data/definitions/79.html\n',
      normative: true,
    };
    expect(buildCitation(withNewlines)).toBe(
      'CWE-79: Improper Neutralization of Input — https://cwe.mitre.org/data/definitions/79.html (Normative)',
    );
  });

  it('joins multiple citations with \\n', () => {
    const s1: Source = {
      kind: 'CWE',
      citation: 'CWE-79',
      url: 'https://cwe.mitre.org/data/definitions/79.html',
      normative: true,
    };
    const s2: Source = {
      kind: 'CAPEC',
      citation: 'CAPEC-63',
      url: 'https://capec.mitre.org/data/definitions/63.html',
      normative: true,
    };
    const s3: Source = {
      kind: 'OTHER',
      citation: 'OWASP Cross Site Scripting (XSS)',
      url: 'https://owasp.org/www-community/attacks/xss/',
    };
    const all = buildCitations([s1, s2, s3]);
    expect(all).toBe(
      [
        'CWE-79 — https://cwe.mitre.org/data/definitions/79.html (Normative)',
        'CAPEC-63 — https://capec.mitre.org/data/definitions/63.html (Normative)',
        'OWASP Cross Site Scripting (XSS) — https://owasp.org/www-community/attacks/xss/ (Informative)',
      ].join('\n'),
    );
  });
});
