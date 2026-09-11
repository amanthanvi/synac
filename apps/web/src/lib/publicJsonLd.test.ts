import { describe, expect, it } from 'vitest';

import {
  buildEntryJsonLd,
  buildTagJsonLd,
  escapeJsonLd,
  serializeJsonLd,
} from './publicJsonLd';

describe('escapeJsonLd', () => {
  it('neutralises a closing script tag', () => {
    const escaped = escapeJsonLd(
      '{"name":"</script><script>alert(1)</script>"}',
    );
    expect(escaped).not.toContain('</script>');
    expect(escaped).not.toContain('<');
    expect(escaped).toContain('\\u003c');
  });

  it('neutralises HTML comment and CDATA openers', () => {
    expect(escapeJsonLd('<!--')).toBe('\\u003c!--');
    expect(escapeJsonLd('<![CDATA[')).toBe('\\u003c![CDATA[');
  });

  it('escapes ampersands and JS line separators', () => {
    expect(escapeJsonLd('a & b')).toBe('a \\u0026 b');
    expect(escapeJsonLd('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeJsonLd('{"name":"TLS 1.3"}')).toBe('{"name":"TLS 1.3"}');
  });
});

describe('serializeJsonLd', () => {
  it('round-trips back to the original value', () => {
    const value = { '@type': 'DefinedTerm', name: '</script> & <b>x</b>' };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual(value);
  });
});

describe('buildEntryJsonLd', () => {
  const built = buildEntryJsonLd({
    url: 'https://synac.app/term/zero-trust',
    name: 'Zero trust',
    description: 'A security model.',
    senses: [
      {
        name: 'Network architecture',
        description: 'No implicit trust.',
        url: 'https://synac.app/term/zero-trust#s-network',
        citations: [
          {
            url: 'https://csrc.nist.gov/x',
            name: 'SP 800-207',
            publisher: 'NIST',
          },
          { url: 'https://example.test/y', name: 'Untitled', publisher: null },
        ],
      },
    ],
  });

  it('emits a DefinedTermSet with one DefinedTerm per sense', () => {
    expect(built).toEqual({
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      '@id': 'https://synac.app/term/zero-trust',
      name: 'Zero trust',
      url: 'https://synac.app/term/zero-trust',
      description: 'A security model.',
      hasDefinedTerm: [
        {
          '@type': 'DefinedTerm',
          name: 'Network architecture',
          description: 'No implicit trust.',
          url: 'https://synac.app/term/zero-trust#s-network',
          inDefinedTermSet: 'https://synac.app/term/zero-trust',
          // The second citation has no publisher, so it carries no key at all.
          citation: [
            {
              '@type': 'CreativeWork',
              name: 'SP 800-207',
              url: 'https://csrc.nist.gov/x',
              publisher: { '@type': 'Organization', name: 'NIST' },
            },
            {
              '@type': 'CreativeWork',
              name: 'Untitled',
              url: 'https://example.test/y',
            },
          ],
        },
      ],
    });
  });

  it('omits hasDefinedTerm and description when there is neither', () => {
    expect(
      buildEntryJsonLd({
        url: 'https://synac.app/term/x',
        name: 'X',
        description: null,
        senses: [],
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      '@id': 'https://synac.app/term/x',
      name: 'X',
      url: 'https://synac.app/term/x',
    });
  });
});

describe('buildTagJsonLd', () => {
  it('emits a DefinedTermSet of tagged entries', () => {
    expect(
      buildTagJsonLd({
        url: 'https://synac.app/tags/crypto',
        name: 'Cryptography',
        description: null,
        terms: [
          {
            name: 'AES',
            url: 'https://synac.app/acronym/aes',
            description: 'A cipher.',
          },
        ],
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      '@id': 'https://synac.app/tags/crypto',
      name: 'Cryptography',
      url: 'https://synac.app/tags/crypto',
      hasDefinedTerm: [
        {
          '@type': 'DefinedTerm',
          name: 'AES',
          url: 'https://synac.app/acronym/aes',
          inDefinedTermSet: 'https://synac.app/tags/crypto',
          description: 'A cipher.',
        },
      ],
    });
  });
});
