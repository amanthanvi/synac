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

  it('maps parsed entries to bundle entries with stable sense keys and citations', () => {
    const sample = [
      '   $ domain',
      '      1a. (I) /general security/ An environment or context.',
      '      1b. (O) /security policy/ A set of users.',
    ].join('\n');

    const entry = bundleEntriesFromParsed(parseRfc4949Entries(sample), 100)[0]!;
    expect(entry).toMatchObject({
      entryType: 'TERM',
      slug: 'domain',
      title: 'domain',
    });
    expect(entry.senses.map((sense) => sense.key)).toEqual([
      '1a-i-general-security',
      '1b-o-security-policy',
    ]);
    expect(entry.senses[0]!.citation).toMatchObject({
      documentKey: 'rfc4949-txt',
      citationText: 'RFC 4949, § "domain"',
    });
  });

  it('turns See and Compare sentences into relationships without editing the definition', () => {
    const sample = [
      '   $ domain',
      '      1a. (I) An environment or context. (See: CA domain, domain of',
      '      interpretation, security perimeter. Compare: COI, enclave.)',
      '      1b. (O) A set of users. (See: security perimeter.)',
      '',
      '   $ CA domain',
      '      (I) The set of certificates issued by one CA.',
      '',
      '   $ domain of interpretation',
      '      (I) A parameter set for a security protocol.',
      '',
      '   $ security perimeter',
      '      (I) The boundary of a protected region.',
      '',
      '   $ COI',
      '      (I) A group with a shared mission.',
      '',
      '   $ enclave',
      '      (I) A protected area.',
    ].join('\n');

    const entries = bundleEntriesFromParsed(parseRfc4949Entries(sample), 100);
    const domain = entries.find((entry) => entry.slug === 'domain')!;
    expect(domain.relationships).toEqual([
      { toType: 'TERM', toSlug: 'ca-domain', type: 'SEE_ALSO' },
      { toType: 'TERM', toSlug: 'domain-of-interpretation', type: 'SEE_ALSO' },
      { toType: 'TERM', toSlug: 'security-perimeter', type: 'SEE_ALSO' },
      { toType: 'ACRONYM', toSlug: 'coi', type: 'CONTRAST' },
      { toType: 'TERM', toSlug: 'enclave', type: 'CONTRAST' },
    ]);
    expect(domain.senses[0]!.definitionMd).toContain('Compare: COI, enclave.');
  });

  it('stops the glossary at the next top-level section header', () => {
    const sample = [
      '4. Definitions',
      '',
      '   $ zeroize',
      '      (I) Use rewriting to destroy data stored in a device.',
      '',
      '   $ zone of control',
      '      (D) Synonym for "inspectable space". [C4009] (See: TEMPEST.)',
      '',
      '5. Security Considerations',
      '',
      '   This document mainly defines security terms and recommends how to',
      '   use them.',
      '',
      '6. Normative Reference',
      '',
      '   [R2119]  Bradner, S., "Key words for use in RFCs to Indicate',
      '      Requirement Levels", BCP 14, RFC 2119, March 1997.',
      '',
      '7. Informative References',
      '',
      '   [A1523]  U.S. Department of the Army, "Installation Security".',
      '',
      "Author's Address",
      '',
      '   Robert W. Shirey',
      '',
      'Acknowledgement',
      '',
      '   Funding for the RFC Editor function is provided by the Internet',
      '   Society.',
    ].join('\n');

    const entries = parseRfc4949Entries(sample);
    expect(entries.map((entry) => entry.title)).toEqual([
      'zeroize',
      'zone of control',
    ]);

    const last = entries[entries.length - 1]!;
    expect(last.senses).toHaveLength(1);
    const definitionMd = last.senses[0]!.definitionMd;
    expect(definitionMd).toBe(
      'Synonym for "inspectable space". [C4009] (See: TEMPEST.)',
    );
    expect(definitionMd).not.toContain('Security Considerations');
    expect(definitionMd).not.toContain('[R2119]');
    expect(definitionMd).not.toContain('Informative References');
    expect(definitionMd).not.toContain('Funding for the RFC Editor');
    expect(definitionMd.length).toBeLessThan(200);
    expect(last.summaryMd.length).toBeLessThan(200);
  });

  it('drops self-references and references to entries outside the bundle', () => {
    const sample = [
      '   $ enclave',
      '      (I) A protected area. (See: enclave, secondary definition under',
      '      boundary, a term this glossary does not define.)',
      '',
      '   $ boundary',
      '      (I) A physical or logical perimeter.',
    ].join('\n');

    const entries = bundleEntriesFromParsed(parseRfc4949Entries(sample), 100);
    const enclave = entries.find((entry) => entry.slug === 'enclave')!;
    expect(enclave.relationships).toEqual([
      { toType: 'TERM', toSlug: 'boundary', type: 'SEE_ALSO' },
    ]);
  });
});
