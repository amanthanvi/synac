import { describe, expect, it } from 'vitest';

import { bundleEntriesFromParsed, parseRfc4949Entries } from './rfc4949.js';

describe('rfc4949 parsing', () => {
  it('parses multi-definition entries and strips page headers', () => {
    const sample = [
      '4. Definitions',
      '',
      '   $ DOI',
      '      (I) See: Domain of Interpretation.',
      '',
      '   $ domain',
      '      1a. (I) /general security/ An environment or context that (a)',
      '      includes a set of system resources.',
      '',
      'Shirey                       Informational                    [Page 109]',
      '',
      'RFC 4949         Internet Security Glossary, Version 2       August 2007',
      '',
      '      Tutorial: A "controlled interface" is required.',
      '',
      '      1b. (O) /security policy/ A set of users and a common security policy.',
    ].join('\n');

    const entries = parseRfc4949Entries(sample);
    expect(entries.map((e) => e.title)).toEqual(['DOI', 'domain']);

    const doi = entries[0]!;
    expect(doi.entryType).toBe('ACRONYM');
    expect(doi.senses[0]!.expandedForm).toBe('Domain of Interpretation');

    const domain = entries[1]!;
    expect(domain.entryType).toBe('TERM');
    expect(domain.senses).toHaveLength(2);
    expect(domain.senses[0]!.senseLabel).toContain('1a');
    expect(domain.senses[0]!.senseLabel).toContain('(I)');
    expect(domain.senses[0]!.senseLabel).toContain('/general security/');
    expect(domain.senses[0]!.definitionMd).toContain('An environment or context');
    expect(domain.senses[0]!.definitionMd).toContain('Tutorial: A "controlled interface"');
  });

  it('extracts trailing abbreviations into variants', () => {
    const sample = [
      '4. Definitions',
      '',
      '   $ Abstract Syntax Notation One (ASN.1)',
      '      (N) A standard for describing data objects.',
    ].join('\n');

    const entries = parseRfc4949Entries(sample);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe('Abstract Syntax Notation One');
    expect(entries[0]!.variants).toEqual([{ variantText: 'ASN.1', variantType: 'ABBREVIATION' }]);
  });

  it('maps parsed entries to bundle entries with stable sense keys and citations', () => {
    const sample = [
      '   $ domain',
      '      1a. (I) /general security/ An environment or context.',
      '      1b. (O) /security policy/ A set of users.',
    ].join('\n');

    const [entry] = bundleEntriesFromParsed(parseRfc4949Entries(sample), 100);
    expect(entry).toMatchObject({ entryType: 'TERM', slug: 'domain', title: 'domain' });
    expect(entry.senses.map((sense) => sense.key)).toEqual(['1a-i-general-security', '1b-o-security-policy']);
    expect(entry.senses[0].citation).toMatchObject({
      documentKey: 'rfc4949-txt',
      citationText: 'RFC 4949, § "domain"',
    });
  });
});
