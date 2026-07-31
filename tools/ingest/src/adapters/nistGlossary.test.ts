import { describe, expect, it } from 'vitest';

import { parseNistTermPage, termSlugFromUrl } from './nistGlossary.js';

describe('nist glossary term page parsing', () => {
  it('parses title, first definition, and abbreviation variants', () => {
    const html = [
      '<html><body>',
      '<h3 id="term-text">advanced encryption standard</h3>',
      '<a id="term-abbr-link-0" href="/glossary/term/aes">AES</a>',
      '<span id="term-abbr-text-0">AES</span>',
      '<span id="term-def-text-0">The encryption standard specified in <a href="#">FIPS 197</a>,',
      '  based on the Rijndael algorithm.</span>',
      '<span id="term-def-text-1">A secondary definition.</span>',
      '</body></html>',
    ].join('\n');

    const parsed = parseNistTermPage(html);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('advanced encryption standard');
    expect(parsed!.entryType).toBe('TERM');
    expect(parsed!.definitionMd).toBe(
      'The encryption standard specified in FIPS 197, based on the Rijndael algorithm.',
    );
    expect(parsed!.variants).toEqual([{ variantText: 'AES', variantType: 'ABBREVIATION' }]);
  });

  it('classifies initialism titles as acronyms', () => {
    const html = [
      '<h3 id="term-text">TLS</h3>',
      '<span id="term-def-text-0">A protocol for protecting network traffic.</span>',
    ].join('\n');

    const parsed = parseNistTermPage(html);
    expect(parsed!.entryType).toBe('ACRONYM');
  });

  it('returns null when the title or definition is missing', () => {
    expect(parseNistTermPage('<h3 id="term-text">orphan</h3>')).toBeNull();
    expect(parseNistTermPage('<span id="term-def-text-0">definition only</span>')).toBeNull();
  });
});

describe('nist term url natural ids', () => {
  it('derives a stable slug from the term path segment', () => {
    expect(termSlugFromUrl('https://csrc.nist.gov/glossary/term/advanced_encryption_standard')).toBe(
      'advanced-encryption-standard',
    );
    expect(termSlugFromUrl('https://csrc.nist.gov/glossary/term/Zero%20Trust')).toBe('zero-trust');
  });
});
