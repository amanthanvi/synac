import { sourceFileSchema } from '@synac/content-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../net/safeFetch.js', () => ({ safeFetch: vi.fn() }));

import { safeFetch } from '../net/safeFetch.js';
import { parseNistTermPage, runNistGlossary, termSlugFromUrl } from './nistGlossary.js';

beforeEach(() => {
  vi.mocked(safeFetch).mockReset();
});

function htmlResponse(url: string, body: string, sha256: string) {
  return {
    url,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    etag: null,
    lastModified: null,
    body: Buffer.from(body),
    sha256,
  };
}

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

describe('nist glossary ingest freshness', () => {
  it('re-fetches term pages when the index document is unchanged', async () => {
    const source = sourceFileSchema.parse({
      slug: 'nist-csrc-glossary',
      name: 'NIST CSRC Glossary',
      baseUrl: 'https://csrc.nist.gov/glossary',
      license: {
        type: 'US_GOV_PD',
        allowedUse: 'Reproduce with citation.',
        attributionRequirements: 'NIST CSRC Glossary',
      },
      accessMethod: 'HTML',
      trustTier: 'TIER1',
      enabled: true,
      lastVerifiedAt: '2026-07-01',
    });
    const indexUrl = 'https://csrc.nist.gov/glossary';
    const termUrl = 'https://csrc.nist.gov/glossary/term/zero_trust';
    const indexHtml = '<a href="/glossary/term/zero_trust">Zero Trust</a>';
    const termHtml = (definition: string) =>
      `<h3 id="term-text">Zero Trust</h3><span id="term-def-text-0">${definition}</span>`;

    vi.mocked(safeFetch)
      .mockResolvedValueOnce(htmlResponse(indexUrl, indexHtml, 'a'.repeat(64)))
      .mockResolvedValueOnce(htmlResponse(termUrl, termHtml('First definition.'), 'b'.repeat(64)));
    const previous = await runNistGlossary({
      source,
      previous: null,
      maxItems: 1,
      now: new Date('2026-07-01T00:00:00Z'),
    });

    vi.mocked(safeFetch)
      .mockResolvedValueOnce(htmlResponse(indexUrl, indexHtml, 'a'.repeat(64)))
      .mockResolvedValueOnce(htmlResponse(termUrl, termHtml('Corrected definition.'), 'c'.repeat(64)));
    const current = await runNistGlossary({
      source,
      previous,
      maxItems: 1,
      now: new Date('2026-07-02T00:00:00Z'),
    });

    expect(current.entries[0]?.senses[0]?.definitionMd).toBe('Corrected definition.');
    expect(safeFetch).toHaveBeenCalledTimes(4);
  });
});
