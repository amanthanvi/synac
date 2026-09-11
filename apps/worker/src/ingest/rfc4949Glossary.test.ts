import { describe, expect, it } from 'vitest';

import { parseRfc4949Entries, parseSeeAlsoTargets } from './rfc4949Glossary.js';

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
      '',
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
    expect(domain.senses[0]!.definitionMd).toContain(
      'An environment or context',
    );
    expect(domain.senses[0]!.definitionMd).toContain(
      'Tutorial: A "controlled interface"',
    );
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
    expect(entries[0]!.variants).toEqual([
      { variantText: 'ASN.1', variantType: 'ABBREVIATION' },
    ]);
  });
});

describe('parseSeeAlsoTargets', () => {
  it('extracts a single cross-reference', () => {
    expect(parseSeeAlsoTargets('(I) See: Domain of Interpretation.')).toEqual([
      'Domain of Interpretation',
    ]);
  });

  it('splits a comma-separated list', () => {
    expect(
      parseSeeAlsoTargets('See: cryptographic key, key management.'),
    ).toEqual(['cryptographic key', 'key management']);
  });

  it('splits on "and" as well as commas', () => {
    expect(parseSeeAlsoTargets('See: access control and audit trail.')).toEqual(
      ['access control', 'audit trail'],
    );
  });

  it('joins a reference that wraps across lines', () => {
    const definition = [
      'See: access control, discretionary access',
      'control.',
    ].join('\n');
    expect(parseSeeAlsoTargets(definition)).toEqual([
      'access control',
      'discretionary access control',
    ]);
  });

  it('stops at the end of the See sentence', () => {
    const definition =
      'See: key management. Tutorial: keys must be protected in transit.';
    expect(parseSeeAlsoTargets(definition)).toEqual(['key management']);
  });

  it('drops stopword-only candidates', () => {
    expect(
      parseSeeAlsoTargets('See: Deprecated, the, access control.'),
    ).toEqual(['access control']);
  });

  it('dedupes case-insensitively', () => {
    expect(parseSeeAlsoTargets('See: Access Control, access control.')).toEqual(
      ['Access Control'],
    );
  });

  it('returns nothing when there is no See line', () => {
    expect(parseSeeAlsoTargets('(I) An environment or context.')).toEqual([]);
  });
});

describe('parseRfc4949Entries seeAlso', () => {
  it("collects SEE_ALSO targets across an entry's senses and skips self-references", () => {
    const sample = [
      '4. Definitions',
      '',
      '   $ domain',
      '      1a. (I) An environment or context. See: security domain, domain.',
      '',
      '      1b. (O) A set of users. See: security policy.',
    ].join('\n');

    const entries = parseRfc4949Entries(sample);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.seeAlso).toEqual(['security domain', 'security policy']);
  });

  it('leaves seeAlso empty when an entry has no cross-references', () => {
    const sample = ['   $ widget', '      (N) A thing.'].join('\n');
    expect(parseRfc4949Entries(sample)[0]?.seeAlso).toEqual([]);
  });
});
